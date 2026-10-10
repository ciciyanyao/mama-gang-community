// pages/tree-hole/tree-hole.js
// 数据来源：cloudfunctions/treehole（post / list / hug），云端持久化
Page({
  data: {
    moodInput: '',
    inputMaxHeight: 150, // textarea 最大高度（页面高度 1/4，onLoad 计算）
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
    // 输入框最大高度 = 页面高度的 1/4
    try {
      const sys = wx.getSystemInfoSync()
      this.setData({ inputMaxHeight: Math.floor(sys.windowHeight / 4) })
    } catch (e) {}
    this.loadPosts()
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
    this.setData({ moodInput: e.detail.value })
  },

  // ========== 投递树洞 ==========
  async postMood() {
    const text = this.data.moodInput.trim()
    if (text.length < 5) {
      wx.showToast({ title: '再多写几个字吧', icon: 'none' })
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
