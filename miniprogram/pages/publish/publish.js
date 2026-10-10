// pages/publish/publish.js —— 发帖页（类 C：发帖与内容安全）
// 正文使用 <editor> 富文本组件，#标签 自动蓝色高亮
// 策略：仅在 #标签 集合变化时才用 setContents 重建 delta，避免光标跳动
// 守卫 _settingContents 防止 setContents → bindinput → setContents 递归循环
const auth = require('../../utils/auth.js')
const draftUtil = require('../../utils/draft.js')
const { CATEGORIES, TAG_RULES, MAX_MEDIA_COUNT } = require('../../config/index.js')

// #标签 蓝色（小红书风格蓝色调）
const TAG_COLOR = '#3B7DC4'

Page({
  data: {
    // 登录态
    isLogin: false,

    // 状态栏高度（自定义导航栏需适配）
    statusBarHeight: 20,

    // 表单数据
    title: '',
    content: '',           // 正文纯文本（从 editor 实时同步）
    selectedCategories: [],
    isAnonymous: false,
    images: [],

    // editor 高度（动态自适应）
    editorHeight: 240,

    // 板块列表
    categoryList: CATEGORIES.map(c => ({ value: c.value, label: c.label, selected: false })),

    // 推荐话题 chip
    topicChips: [],

    // UI 状态
    publishing: false,
    showDraftDialog: false
  },

  // ========== 生命周期 ==========
  onLoad() {
    try {
      const sys = wx.getSystemInfoSync()
      this.setData({ statusBarHeight: sys.statusBarHeight || 20 })
    } catch (e) {}

    if (draftUtil.hasDraft()) {
      this.setData({ showDraftDialog: true })
    }
    this.updateTopicChips()
    this.fetchPopularTags()
  },

  // editor 组件准备好 → 创建 ctx，如有草稿则 setContents
  onEditorReady() {
    this.editorCtx = wx.createSelectorQuery().select('#contentEditor').context((res) => {
      if (!res || !res.context) return
      const ctx = res.context
      this.editorCtx = ctx

      // 如有草稿，加载富文本（带蓝色标签）
      const draft = draftUtil.getDraft()
      if (draft && draft.content) {
        this._settingContents = true
        const delta = this.buildColoredDelta(draft.content)
        ctx.setContents({ delta })
        this.setData({ content: draft.content })
        // 下一帧解除守卫
        setTimeout(() => { this._settingContents = false }, 0)
      }
    }).exec()
  },

  // ========== 草稿确认弹窗 ==========
  onContinueDraft() {
    const draft = draftUtil.getDraft()
    if (draft) {
      const restoredCategories = draft.selectedCategories
        || (draft.category ? [draft.category] : [])
      this.setData({
        title: draft.title || '',
        selectedCategories: restoredCategories,
        categoryList: CATEGORIES.map(c => ({
          value: c.value, label: c.label,
          selected: restoredCategories.includes(c.value)
        })),
        isAnonymous: draft.is_anonymous || false,
        images: (draft.images || []).map(p => this.toMediaItem(p))
      })
      // editor 草稿恢复（等 editorCtx 就绪后再 setContents）
      const applyContent = () => {
        if (!this.editorCtx) {
          setTimeout(applyContent, 50)
          return
        }
        this._settingContents = true
        const delta = this.buildColoredDelta(draft.content || '')
        this.editorCtx.setContents({ delta })
        this.setData({ content: draft.content || '' })
        setTimeout(() => { this._settingContents = false }, 0)
      }
      applyContent()
      this.updateTopicChips()
      wx.showToast({ title: '已恢复草稿', icon: 'none' })
    }
    this.setData({ showDraftDialog: false })
  },

  onDiscardDraft() {
    draftUtil.clearDraft()
    this.setData({
      title: '',
      selectedCategories: [],
      categoryList: CATEGORIES.map(c => ({ value: c.value, label: c.label, selected: false })),
      isAnonymous: false,
      images: [],
      showDraftDialog: false
    })
    // editor 清空
    if (this.editorCtx) {
      this._settingContents = true
      this.editorCtx.clear()
      this.setData({ content: '' })
      setTimeout(() => { this._settingContents = false }, 0)
    }
    this.updateTopicChips()
    wx.showToast({ title: '已创建新帖', icon: 'none' })
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 })
    }
    this.setData({ isLogin: auth.isLogin() })
    if (!auth.isLogin()) {
      this.selectComponent('#loginModal').show()
    }
  },

  onHide() { this.autoSaveDraft() },
  onUnload() { this.autoSaveDraft() },

  // ========== input 事件 ==========
  onTitleInput(e) {
    this.setData({ title: e.detail.value })
    this.updateTopicChips()
  },

  // editor 的 bindinput：处理富文本变化
  onEditorInput(e) {
    // 解除 setContents 递归
    if (this._settingContents) return

    const plain = e.detail.text || ''
    const prevContent = this.data.content || ''

    // 1. 同步 content（纯文本，用于草稿/发布/推荐匹配）
    this.setData({
      content: plain,
      editorHeight: e.detail.height || 240
    })

    // 2. 检测标签集合是否变化
    const prevTags = this._tagSet(prevContent)
    const nowTags = this._tagSet(plain)
    const changed =
      prevTags.size !== nowTags.size ||
      [...prevTags].some(t => !nowTags.has(t)) ||
      [...nowTags].some(t => !prevTags.has(t))

    // 3. 仅在标签集变化时重建 delta（给 #标签 上色）
    if (changed) {
      this._settingContents = true
      const delta = this.buildColoredDelta(plain)
      this.editorCtx.setContents({ delta })
      setTimeout(() => { this._settingContents = false }, 0)
    }

    this.updateTopicChips()
  },

  // 从纯文本中提取 #标签 集合
  _tagSet(text) {
    const s = new Set()
    const regex = /#([^\s#]+)/g
    let m
    while ((m = regex.exec(text)) !== null) {
      if (m[1]) s.add(m[1])
    }
    return s
  },

  // ========== 核心：构建带 #标签 蓝色的 delta ==========
  // 输入纯文本，返回 Quill delta：普通段无色，#标签 段加 color
  buildColoredDelta(text) {
    const ops = []
    const regex = /#([^\s#]+)/g
    let lastIdx = 0
    let m
    while ((m = regex.exec(text)) !== null) {
      // # 之前的普通文本
      if (m.index > lastIdx) {
        ops.push({ insert: text.slice(lastIdx, m.index) })
      }
      // 整个 #标签 作为一段（包含 #号）
      const tagText = m[0]
      ops.push({
        insert: tagText,
        attributes: { color: TAG_COLOR }
      })
      lastIdx = m.index + tagText.length
    }
    // 尾部普通文本
    if (lastIdx < text.length) {
      ops.push({ insert: text.slice(lastIdx) })
    }
    // 空内容也要有一个换行（editor 组件要求）
    if (ops.length === 0) {
      ops.push({ insert: '\n' })
    }
    return { ops }
  },

  // ========== 推荐话题 chip ==========
  updateTopicChips(popularTags) {
    const text = `${this.data.title} ${this.data.content}`
    const contentTags = this._tagSet(this.data.content)
    const chips = []

    for (const rule of TAG_RULES) {
      if (contentTags.has(rule.tag)) continue
      if (rule.keywords.some(kw => text.includes(kw))) {
        chips.push(rule.tag)
      }
    }

    if (popularTags && popularTags.length > 0) {
      const localSet = new Set(chips)
      for (const t of popularTags) {
        if (contentTags.has(t) || localSet.has(t)) continue
        chips.push(t)
      }
    }

    this.setData({ topicChips: chips.slice(0, 8) })
  },

  async fetchPopularTags() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'post',
        data: { action: 'getPopularTags', limit: 20 }
      })
      const tags = (res.result && res.result.data) || []
      this.updateTopicChips(tags)
    } catch (e) {
      this.updateTopicChips()
    }
  },

  // 点击话题 chip → 在光标位置插入 #标签
  onTapTopicChip(e) {
    const tag = e.currentTarget.dataset.tag
    if (!tag || !this.editorCtx) return
    if (this._tagSet(this.data.content).has(tag)) {
      wx.showToast({ title: `已添加 #${tag}`, icon: 'none' })
      return
    }
    // 在当前光标位置插入（editor 会自动触发 bindinput → 同步 content）
    this.editorCtx.insertText({ text: `#${tag} ` })
  },

  // ========== 板块选择 ==========
  onToggleCategory(e) {
    const value = e.currentTarget.dataset.value
    if (!value) return
    const selected = [...this.data.selectedCategories]
    const idx = selected.indexOf(value)
    if (idx >= 0) selected.splice(idx, 1)
    else selected.push(value)
    const categoryList = this.data.categoryList.map(c => ({
      ...c,
      selected: c.value === value ? !c.selected : c.selected
    }))
    this.setData({ selectedCategories: selected, categoryList })
  },

  // ========== 匿名开关 ==========
  onAnonymousToggle(e) {
    this.setData({ isAnonymous: e.detail.value })
  },

  // ========== 媒体上传 ==========
  onChooseMedia() {
    const remain = MAX_MEDIA_COUNT - this.data.images.length
    if (remain <= 0) {
      wx.showToast({ title: `最多上传${MAX_MEDIA_COUNT}个素材`, icon: 'none' })
      return
    }
    wx.chooseMedia({
      count: remain,
      mediaType: ['image', 'video'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const newItems = res.tempFiles.map(f => this.toMediaItem(f.tempFilePath))
        this.setData({ images: [...this.data.images, ...newItems] })
      },
      fail: () => {}
    })
  },

  toMediaItem(path) {
    return { path, isVideo: /\.(mp4|mov|avi|mkv|webm)$/i.test(path) }
  },

  onRemoveMedia(e) {
    const idx = e.currentTarget.dataset.index
    const images = [...this.data.images]
    images.splice(idx, 1)
    this.setData({ images })
  },

  onPreviewMedia(e) {
    const idx = e.currentTarget.dataset.index
    const item = this.data.images[idx]
    if (!item) return
    if (item.isVideo) {
      wx.showToast({ title: '视频暂不支持预览', icon: 'none' })
    } else {
      wx.previewImage({
        urls: this.data.images.filter(m => !m.isVideo).map(m => m.path),
        current: item.path
      })
    }
  },

  // ========== 发布流程 ==========
  async onPublish() {
    if (this.data.publishing) return
    if (!auth.isLogin()) {
      this.selectComponent('#loginModal').show()
      return
    }

    const { title, content, selectedCategories, images } = this.data
    if (!title.trim()) { wx.showToast({ title: '请输入标题', icon: 'none' }); return }
    if (!content.trim()) { wx.showToast({ title: '请输入正文', icon: 'none' }); return }
    if (selectedCategories.length === 0) { wx.showToast({ title: '请至少选择一个板块', icon: 'none' }); return }

    this.setData({ publishing: true })
    wx.showLoading({ title: '发布中...', mask: true })

    try {
      let uploadedImages = []
      if (images.length > 0) {
        wx.showLoading({ title: '上传素材中...', mask: true })
        for (let i = 0; i < images.length; i++) {
          const path = images[i].path
          if (path.startsWith('cloud://')) { uploadedImages.push(path); continue }
          const ext = (path.split('.').pop() || 'jpg').toLowerCase()
          const cloudPath = `posts/${auth.getUserInfo()._id || 'anon'}/${Date.now()}-${i}-${Math.floor(Math.random() * 10000)}.${ext}`
          const uploadRes = await wx.cloud.uploadFile({ cloudPath, filePath: path })
          uploadedImages.push(uploadRes.fileID)
        }
      }

      wx.showLoading({ title: '内容审核中...', mask: true })
      const res = await wx.cloud.callFunction({
        name: 'post',
        data: {
          action: 'create',
          title: title.trim(),
          content: content.trim(),  // 纯文本（#标签文本内嵌）
          images: uploadedImages,
          category: selectedCategories[0],
          categories: selectedCategories,
          is_anonymous: this.data.isAnonymous
        }
      })

      const result = res.result
      if (result.code === 0) {
        draftUtil.clearDraft()
        wx.hideLoading()
        wx.showToast({ title: '发布成功', icon: 'success' })
        setTimeout(() => {
          wx.switchTab({ url: '/pages/index/index' })
        }, 800)
      } else {
        wx.hideLoading()
        wx.showModal({ title: '发布失败', content: result.msg || '发布失败，请重试', showCancel: false })
      }
    } catch (err) {
      console.error('发布异常：', err)
      wx.hideLoading()
      wx.showToast({ title: '网络异常，请重试', icon: 'none' })
    } finally {
      this.setData({ publishing: false })
    }
  },

  // ========== 草稿自动保存 ==========
  autoSaveDraft() {
    const { title, content, selectedCategories, isAnonymous, images } = this.data
    draftUtil.saveDraft({
      title,
      content,        // editor 的纯文本（已包含 #标签）
      selectedCategories,
      is_anonymous: isAnonymous,
      images: images.map(m => m.path)
    })
  },

  onLoginSuccess() { this.setData({ isLogin: true }) }
})
