// pages/tree-hole/tree-hole.js
// 数据来源：cloudfunctions/treehole（post / list / hug），云端持久化
const auth = require('../../utils/auth.js')

// 内容长度上限（与服务端 treehole 云函数 MAX_CONTENT_LEN 保持一致）
const MAX_INPUT_LEN = 5000

// 树洞输入框高度：纯算法控制（不依赖 auto-height / max-height，微信渲染层对这两个的动态行为不可靠）
//  - 行数 = 字符数 ÷ 每行可容纳字符数（onReady 用实际宽度量出）
//  - 高度 = 行数 × 行高 + 垂直内边距，下限 76rpx（38px）
//  - 封顶：≥200 字时高度锁死为"200 字行数"的高度，超出内容在框内滚动，绝不再长
//  - 全选删光：行数归零 → 高度自动回缩到下限
const MAX_INPUT_CHARS = 200
const CHAR_WIDTH = 14 // 字号 28rpx = 14px（中文全角字宽）
const LINE_HEIGHT = 21 // 行高 14 × 1.5
const PAD_V = 22 // 垂直内边距 16rpx+6rpx = 11px × 2
const MIN_INPUT_HEIGHT = 38 // min-height 76rpx = 38px

Page({
  data: {
    moodInput: '',
    maxInputLen: MAX_INPUT_LEN,
    inputCount: 0, // 当前输入字符数（独立字段驱动计数显示，避免任何绑定问题）
    inputHeight: MIN_INPUT_HEIGHT, // textarea style 高度（px），完全由 JS 计算
    // 卡片随机背景图（展示层，不入库）
    cardBackgrounds: [
      '/pages/tree-hole/images/card1.png',
      '/pages/tree-hole/images/card2.png',
      '/pages/tree-hole/images/card3.png',
      '/pages/tree-hole/images/card4.png',
      '/pages/tree-hole/images/card5.png'
    ],
    // 随机装饰物
    decoPool: ['🐻', '🥪', '🥗', '☁️', '⭐', '🍞', '🍃', '☀️'],
    postList: [],
    loading: false
  },

  onLoad() {
    this._lineChars = 15 // 每行可容纳字符数（onReady 用实际宽度校准）
    this._capHeight = MIN_INPUT_HEIGHT // 200 字封顶高度
    this.loadPosts()
  },

  onReady() {
    // 用输入框真实宽度校准"每行字符数"，高度计算才准
    wx.createSelectorQuery()
      .in(this)
      .select('.footer-input')
      .boundingClientRect(rect => {
        if (rect && rect.width) {
          const usable = rect.width - 10 // 减去左右 padding 10rpx×2=10px
          this._lineChars = Math.max(1, usable / CHAR_WIDTH)
          this._capHeight = Math.ceil(MAX_INPUT_CHARS / this._lineChars) * LINE_HEIGHT + PAD_V
        }
      })
      .exec()
  },

  // 进入页面：同步自定义 tabBar 选中态（树洞 = index 3）
  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 3 })
    }
  },

  // ========== 加载树洞列表 ==========
  async loadPosts() {
    if (this.data.loading) return
    this.setData({ loading: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'treehole',
        data: { action: 'list', page: 1, pageSize: 20 }
      })
      const r = res.result
      if (r && r.code === 0) {
        const list = r.data.list.map(item => ({
          _id: item._id,
          nickname: item.nickname,
          content: item.content,
          time: this.formatTime(item.created_at),
          hugCount: item.hug_count || 0,
          hugged: item.hugged || false,
          hugBtnText: item.hugged ? '已抱抱' : '抱抱你',
          deco1: this.data.decoPool[Math.floor(Math.random() * this.data.decoPool.length)],
          deco2: this.data.decoPool[Math.floor(Math.random() * this.data.decoPool.length)],
          bgImage: this.data.cardBackgrounds[Math.floor(Math.random() * this.data.cardBackgrounds.length)]
        }))
        this.setData({ postList: list })
      } else {
        wx.showToast({ title: (r && r.msg) || '加载失败', icon: 'none' })
      }
    } catch (err) {
      console.error('加载树洞失败：', err)
      wx.showToast({ title: '网络异常，请重试', icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  },

  // created_at（Date/ISO 字符串）→ 相对时间文案
  formatTime(createdAt) {
    if (!createdAt) return ''
    const date = new Date(createdAt)
    if (isNaN(date.getTime())) return ''
    const diff = Date.now() - date.getTime()
    const min = Math.floor(diff / 60000)
    if (min < 1) return '刚刚'
    if (min < 60) return `${min}分钟前`
    const hour = Math.floor(min / 60)
    if (hour < 24) return `${hour}小时前`
    const day = Math.floor(hour / 24)
    if (day < 7) return `${day}天前`
    return `${date.getMonth() + 1}月${date.getDate()}日`
  },

  onInput(e) {
    const val = e.detail.value || ''
    const len = val.length

    // 行数：≤200 按实际字符数算（随内容增高）；>200 锁死为 200 字的行数（封顶滚动）
    const lineChars = this._lineChars || 15 // 防御：onReady 未校准前用兜底值
    const lines = len > MAX_INPUT_CHARS
      ? Math.ceil(MAX_INPUT_CHARS / lineChars)
      : Math.ceil(len / lineChars)
    let h = lines * LINE_HEIGHT + PAD_V
    if (h < MIN_INPUT_HEIGHT) h = MIN_INPUT_HEIGHT

    // inputCount 独立驱动计数显示（moodInput 同时保留给 textarea 回填）
    this.setData({ moodInput: val, inputHeight: h, inputCount: len })
  },

  // ========== 投递树洞 ==========
  async postMood() {
    // 未登录：弹登录弹窗，不继续
    if (!auth.requireLogin(this)) return

    const text = this.data.moodInput.trim()
    if (text.length < 5) {
      wx.showToast({ title: '再多写几个字吧', icon: 'none' })
      return
    }
    if (text.length > MAX_INPUT_LEN) {
      wx.showToast({ title: `最多 ${MAX_INPUT_LEN} 字`, icon: 'none' })
      return
    }

    wx.showLoading({ title: '投递中...' })
    try {
      const res = await wx.cloud.callFunction({
        name: 'treehole',
        data: { action: 'post', content: text }
      })
      const r = res.result
      if (r && r.code === 0) {
        // 本地插入新卡片（服务端已持久化，无需重新拉取）
        const newPost = {
          _id: r.data._id,
          nickname: r.data.nickname,
          mood: '', // 投递内容无情绪分类，不显示 mood-tag
          content: text,
          time: '刚刚',
          hugCount: 0,
          hugged: false,
          hugBtnText: '抱抱你',
          deco1: this.data.decoPool[Math.floor(Math.random() * this.data.decoPool.length)],
          deco2: this.data.decoPool[Math.floor(Math.random() * this.data.decoPool.length)],
          bgImage: this.data.cardBackgrounds[Math.floor(Math.random() * this.data.cardBackgrounds.length)]
        }
        this.setData({ postList: [newPost, ...this.data.postList], moodInput: '' })
        wx.showToast({ title: '已经投进树洞了', icon: 'success' })
      } else {
        wx.showToast({ title: (r && r.msg) || '投递失败', icon: 'none' })
      }
    } catch (err) {
      console.error('投递树洞失败：', err)
      wx.showToast({ title: '网络异常，请重试', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  // ========== 抱抱 / 取消抱抱（云端 openid 去重） ==========
  async handleHug(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    try {
      const res = await wx.cloud.callFunction({
        name: 'treehole',
        data: { action: 'hug', id }
      })
      const r = res.result
      if (r && r.code === 0) {
        const list = this.data.postList.map(item => {
          if (item._id === id) {
            item.hugCount = r.data.hug_count
            item.hugged = r.data.hugged
            item.hugBtnText = r.data.hugged ? '已抱抱' : '抱抱你'
          }
          return item
        })
        this.setData({ postList: list })
        if (r.data.hugged) {
          const messages = [
            '给你一个大大的拥抱 🤗',
            '一切都会好起来的 🌈',
            '加油！没有过不去的坎 💪',
            '姐妹抱抱，你不是一个人在战斗 🫂'
          ]
          wx.showToast({ title: messages[Math.floor(Math.random() * messages.length)], icon: 'none', duration: 2000 })
        }
      } else {
        wx.showToast({ title: (r && r.msg) || '操作失败', icon: 'none' })
      }
    } catch (err) {
      console.error('抱抱失败：', err)
      wx.showToast({ title: '网络异常，请重试', icon: 'none' })
    }
  }
})
