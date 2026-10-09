// pages/publish/publish.js —— 发帖页（类 C：发帖与内容安全）
// 参考小红书发帖编辑页布局：顶部标题输入 + 正文输入 + 媒体网格 + 板块选择 + 匿名开关 + 底部发布按钮
// 功能：标题/正文输入、智能标签推荐、图片/视频上传、匿名发布、草稿自动保存、内容安全审核
const auth = require('../../utils/auth.js')
const draftUtil = require('../../utils/draft.js')
const { CATEGORIES, TAG_RULES, MAX_MEDIA_COUNT } = require('../../config/index.js')

Page({
  data: {
    // 登录态
    isLogin: false,

    // 状态栏高度（自定义导航栏需适配）
    statusBarHeight: 20,

    // 表单数据
    title: '',
    content: '',
    selectedCategories: [], // 选中的板块 value 数组（支持多选）
    isAnonymous: false,     // 匿名开关
    images: [],             // 已选媒体临时路径数组（本地临时路径）
    tags: [],               // 已选标签（正文 # 解析 + 推荐点击）
    pickedTags: [],         // 用户从推荐区点击加入的标签
    recommendTags: [],      // 智能推荐标签（根据标题/正文匹配）

    // 列表数据：带 selected 字段，供 WXML 直接访问布尔值（WXML 不支持 indexOf 方法调用）
    categoryList: CATEGORIES.map(c => ({ value: c.value, label: c.label, selected: false })),

    // UI 状态
    publishing: false       // 发布中（loading）
  },

  // ========== 生命周期 ==========
  onLoad() {
    // 获取状态栏高度，适配自定义导航栏
    try {
      const sys = wx.getSystemInfoSync()
      this.setData({ statusBarHeight: sys.statusBarHeight || 20 })
    } catch (e) {}

    // 恢复草稿：有未发布的草稿则自动填充
    const draft = draftUtil.getDraft()
    if (draft) {
      // 兼容旧草稿：category 字符串 → 数组；新草稿：selectedCategories 数组
      const restoredCategories = draft.selectedCategories
        || (draft.category ? [draft.category] : [])
      this.setData({
        title: draft.title || '',
        content: draft.content || '',
        selectedCategories: restoredCategories,
        categoryList: CATEGORIES.map(c => ({
          value: c.value, label: c.label,
          selected: restoredCategories.includes(c.value)
        })),
        isAnonymous: draft.is_anonymous || false,
        images: (draft.images || []).map(p => this.toMediaItem(p)),
        pickedTags: draft.pickedTags || []
      })
      // 从正文重新解析标签并同步
      this.syncTags()
      wx.showToast({ title: '已恢复草稿', icon: 'none' })
    }
    // 初始智能标签推荐
    this.updateRecommendTags()
  },

  // 路径转媒体项（带 isVideo 标记，供 WXML 判断是否显示视频角标）
  toMediaItem(path) {
    return { path, isVideo: /\.(mp4|mov|avi|mkv|webm)$/i.test(path) }
  },

  // 取消：保存草稿 + 返回论坛列表（publish 是 tab 页，需用 switchTab）
  onCancel() {
    this.autoSaveDraft()
    wx.switchTab({ url: '/pages/index/index' })
  },

  onShow() {
    // 自定义 tabBar：同步当前选中 tab
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 })
    }
    // 参与门槛：未登录 → 就地弹出登录界面
    this.setData({ isLogin: auth.isLogin() })
    if (!auth.isLogin()) {
      this.selectComponent('#loginModal').show()
    }
  },

  // 编辑中途退出（onHide/onUnload）→ 自动保存草稿
  onHide() { this.autoSaveDraft() },
  onUnload() { this.autoSaveDraft() },

  // ========== 输入事件 ==========
  onTitleInput(e) {
    this.setData({ title: e.detail.value })
    this.updateRecommendTags()
  },
  onContentInput(e) {
    this.setData({ content: e.detail.value })
    this.syncTags()           // 从正文重新解析 # 标签
    this.updateRecommendTags()
  },

  // ========== 正文 # 标签解析 ==========
  // 规则：# 开头，遇到空格 / # / 字符串结尾 结束
  // 例："今天好开心#生活的小碎片 嘻嘻" → "生活的小碎片"
  extractTagsFromContent(content) {
    const regex = /#([^\s#]+)/g
    const tags = []
    let match
    while ((match = regex.exec(content)) !== null) {
      if (match[1]) tags.push(match[1])
    }
    return [...new Set(tags)]
  },

  // 同步 tags：正文 # 解析标签 + 推荐区点击标签（去重合并）
  syncTags() {
    const contentTags = this.extractTagsFromContent(this.data.content)
    const pickedTags = this.data.pickedTags || []
    const allTags = [...new Set([...contentTags, ...pickedTags])]
    this.setData({ tags: allTags })
  },

  // ========== 板块选择（多选，点击切换选中/取消） ==========
  onToggleCategory(e) {
    const value = e.currentTarget.dataset.value
    if (!value) return
    // 1. 更新 selectedCategories（不可变更新）
    const selected = [...this.data.selectedCategories]
    const idx = selected.indexOf(value)
    if (idx >= 0) {
      selected.splice(idx, 1)
    } else {
      selected.push(value)
    }
    // 2. 同步 categoryList 的 selected 字段（WXML 直接读 item.selected）
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

  // ========== 智能标签推荐 ==========
  // 根据标题+正文匹配 TAG_RULES，命中关键词即推荐对应标签；已选的标签不再推荐
  updateRecommendTags() {
    const text = `${this.data.title} ${this.data.content}`
    const selected = new Set(this.data.tags)
    const recommends = []
    for (const rule of TAG_RULES) {
      if (selected.has(rule.tag)) continue
      if (rule.keywords.some(kw => text.includes(kw))) {
        recommends.push(rule.tag)
      }
    }
    this.setData({ recommendTags: recommends })
  },

  // 点击推荐标签 → 加入 pickedTags，合并到 tags
  onTapRecommendTag(e) {
    const tag = e.currentTarget.dataset.tag
    if (!tag) return
    if (this.data.pickedTags.includes(tag)) return
    const pickedTags = [...this.data.pickedTags, tag]
    this.setData({ pickedTags })
    this.syncTags()
    this.updateRecommendTags()
  },

  // 点击已选标签 → 移除
  // - 推荐标签：从 pickedTags 移除
  // - 正文 # 标签：同时从正文中删除对应的 #标签文本
  onRemoveTag(e) {
    const tag = e.currentTarget.dataset.tag
    if (!tag) return

    // 1. 如果是推荐标签，从 pickedTags 移除
    const pickedIdx = this.data.pickedTags.indexOf(tag)
    if (pickedIdx >= 0) {
      const pickedTags = [...this.data.pickedTags]
      pickedTags.splice(pickedIdx, 1)
      this.setData({ pickedTags })
    }

    // 2. 如果该标签来自正文 # 标签，从正文中移除 #标签文本
    const contentTags = this.extractTagsFromContent(this.data.content)
    if (contentTags.includes(tag)) {
      // 匹配 #标签（后面跟空格、#、或结尾），替换为空
      const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const content = this.data.content.replace(new RegExp(`#${escaped}(?=\\s|#|$)`, 'g'), '')
      this.setData({ content })
    }

    this.syncTags()
    this.updateRecommendTags()
  },

  // ========== 媒体上传（图片/视频） ==========
  onChooseMedia() {
    const remain = MAX_MEDIA_COUNT - this.data.images.length
    if (remain <= 0) {
      wx.showToast({ title: `最多上传${MAX_MEDIA_COUNT}个素材`, icon: 'none' })
      return
    }
    // 选择图片或视频（支持混合）
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

  // 删除已选媒体
  onRemoveMedia(e) {
    const idx = e.currentTarget.dataset.index
    const images = [...this.data.images]
    images.splice(idx, 1)
    this.setData({ images })
  },

  // 预览媒体
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

    // 1. 登录校验
    if (!auth.isLogin()) {
      this.selectComponent('#loginModal').show()
      return
    }

    // 2. 表单校验
    const { title, content, selectedCategories, images } = this.data
    if (!title.trim()) { wx.showToast({ title: '请输入标题', icon: 'none' }); return }
    if (!content.trim()) { wx.showToast({ title: '请输入正文', icon: 'none' }); return }
    if (selectedCategories.length === 0) { wx.showToast({ title: '请至少选择一个板块', icon: 'none' }); return }

    this.setData({ publishing: true })
    wx.showLoading({ title: '发布中...', mask: true })

    try {
      // 3. 上传媒体到云存储（仅上传有内容的）
      let uploadedImages = []
      if (images.length > 0) {
        wx.showLoading({ title: '上传素材中...', mask: true })
        for (let i = 0; i < images.length; i++) {
          const path = images[i].path
          // 已经是云文件 ID（cloud:// 开头）则无需重复上传
          if (path.startsWith('cloud://')) {
            uploadedImages.push(path)
            continue
          }
          const ext = (path.split('.').pop() || 'jpg').toLowerCase()
          const cloudPath = `posts/${auth.getUserInfo()._id || 'anon'}/${Date.now()}-${i}-${Math.floor(Math.random() * 10000)}.${ext}`
          const uploadRes = await wx.cloud.uploadFile({ cloudPath, filePath: path })
          uploadedImages.push(uploadRes.fileID)
        }
      }

      // 4. 调用 post 云函数 create（内含文本+图片内容安全审核）
      wx.showLoading({ title: '内容审核中...', mask: true })
      const res = await wx.cloud.callFunction({
        name: 'post',
        data: {
          action: 'create',
          title: title.trim(),
          content: content.trim(),
          images: uploadedImages,
          category: selectedCategories[0],          // 主分类（第一个）
          categories: selectedCategories,           // 全部分类（多选）
          is_anonymous: this.data.isAnonymous
        }
      })

      const result = res.result
      if (result.code === 0) {
        // 发布成功：清除草稿 + 跳回论坛列表
        draftUtil.clearDraft()
        wx.hideLoading()
        wx.showToast({ title: '发布成功', icon: 'success' })
        setTimeout(() => {
          wx.switchTab({ url: '/pages/index/index' })
        }, 800)
      } else {
        // 发布失败（审核不通过等）
        wx.hideLoading()
        wx.showModal({
          title: '发布失败',
          content: result.msg || '发布失败，请重试',
          showCancel: false
        })
        // 如果是图片审核失败且有 failedIndex，高亮提示
        if (result.failedIndex !== undefined) {
          // 可扩展：标记失败图片（此处仅提示）
        }
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
    const { title, content, selectedCategories, isAnonymous, images, pickedTags } = this.data
    draftUtil.saveDraft({
      title,
      content,
      selectedCategories,
      is_anonymous: isAnonymous,
      images: images.map(m => m.path),  // 存路径字符串，恢复时再转媒体项
      pickedTags
    })
  },

  // 登录成功回调
  onLoginSuccess() {
    this.setData({ isLogin: true })
  }
})
