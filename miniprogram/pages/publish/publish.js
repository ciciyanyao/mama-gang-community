// pages/publish/publish.js —— 发帖页（类 C：发帖与内容安全）
const auth = require('../../utils/auth.js')
const draftUtil = require('../../utils/draft.js')
const { CATEGORIES, MAX_MEDIA_COUNT } = require('../../config/index.js')

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
    alsoToTreehole: false, // 同时投进树洞（仅正文纯文本）
    images: [],

    // editor 高度（动态自适应）
    editorHeight: 240,

    // 板块列表
    categoryList: CATEGORIES.map(c => ({ value: c.value, label: c.label, selected: false })),

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
  },

  // editor 组件准备好 → 创建 ctx，如有草稿则 setContents
  onEditorReady() {
    this.editorCtx = wx.createSelectorQuery().select('#contentEditor').context((res) => {
      if (!res || !res.context) return
      const ctx = res.context
      this.editorCtx = ctx

      // 如有草稿，加载纯文本内容
      const draft = draftUtil.getDraft()
      if (draft && draft.content) {
        this._settingContents = true
        ctx.setContents({ delta: { ops: [{ insert: draft.content }, { insert: '\n' }] } })
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
        this.editorCtx.setContents({ delta: { ops: [{ insert: draft.content || '' }, { insert: '\n' }] } })
        this.setData({ content: draft.content || '' })
        setTimeout(() => { this._settingContents = false }, 0)
      }
      applyContent()
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
  },

  // editor 的 bindinput：同步正文纯文本
  onEditorInput(e) {
    // 守卫：草稿恢复/discard 时的 setContents 不处理
    if (this._settingContents) return

    const plain = e.detail.text || ''
    this.setData({
      content: plain,
      editorHeight: e.detail.height || 240
    })
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

  // ========== 同时投进树洞开关 ==========
  onTreeholeToggle(e) {
    this.setData({ alsoToTreehole: e.detail.value })
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

    const { title, content, selectedCategories, images, alsoToTreehole } = this.data
    if (!title.trim()) { wx.showToast({ title: '请输入标题', icon: 'none' }); return }
    if (!content.trim()) { wx.showToast({ title: '请输入正文', icon: 'none' }); return }
    if (selectedCategories.length === 0) { wx.showToast({ title: '请至少选择一个板块', icon: 'none' }); return }

    // 二次确认：同时投进树洞（仅纯文本、公开、不可修改）
    let syncTreehole = alsoToTreehole
    if (syncTreehole) {
      const confirmed = await new Promise(resolve => {
        wx.showModal({
          title: '同时投进树洞',
          content: '仅正文纯文本会同步至树洞，图片和附件不会带入。树洞内容对所有用户公开，发布后不可修改。',
          confirmText: '同时投树洞',
          cancelText: '只发主帖',
          success: r => resolve(r.confirm)
        })
      })
      if (!confirmed) {
        // 选择只发主帖：关闭开关，避免每次发布都重复弹窗
        this.setData({ alsoToTreehole: false })
        syncTreehole = false
      }
    }

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
          content: content.trim(),
          images: uploadedImages,
          category: selectedCategories[0],
          categories: selectedCategories,
          is_anonymous: this.data.isAnonymous
        }
      })

      const result = res.result
      if (result.code === 0) {
        // 主帖发布成功 → 同步树洞（仅正文纯文本，无身份关联）
        if (syncTreehole) {
          try {
            await wx.cloud.callFunction({
              name: 'treehole',
              data: { action: 'post', content: content.trim() }
            })
          } catch (e) {
            console.error('同步树洞失败：', e)
            wx.hideLoading()
            wx.showModal({
              title: '主帖已发布',
              content: '主帖发布成功，但树洞同步失败，可稍后在树洞页重新投递。',
              showCancel: false
            })
            this.setData({ publishing: false })
            return
          }
        }
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
      content,        // editor 的纯文本
      selectedCategories,
      is_anonymous: isAnonymous,
      images: images.map(m => m.path)
    })
  },

  onLoginSuccess() { this.setData({ isLogin: true }) }
})
