// subpkg/chat/chat.js —— 私信对话页
const { relativeTime, showError } = require('../../utils/util.js')

Page({
  data: {
    peer: '',
    nickname: '',
    messages: [],
    inputText: '',
    loading: false,
    sending: false
  },

  onLoad(options) {
    const { peer, nickname } = options
    if (!peer) {
      wx.showToast({ title: '缺少对话对象', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 1200)
      return
    }
    this.setData({
      peer,
      nickname: nickname ? decodeURIComponent(nickname) : ''
    })
    wx.setNavigationBarTitle({ title: this.data.nickname || '私信' })
    this.loadMessages()
    // 进入对话页即标记该会话已读（对方发来的消息）
    this.markRead()
  },

  onUnload() {
    // 离开对话页时刷新 tabBar 角标（私信已读后，notify.checkUnread 重算）
    const tab = this.getTabBar && this.getTabBar()
    // 对话页是 navigateTo 打开的，getTabBar 拿不到；由消息页/其他 tab 页 onShow 时自动刷新
  },

  // ==================== 加载历史消息 ====================
  async loadMessages() {
    if (this.data.loading) return
    this.setData({ loading: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'message',
        data: { action: 'messages', peer: this.data.peer, page: 1, pageSize: 50 }
      })
      if (res.result.code !== 0) {
        this.setData({ messages: [] })
        return
      }
      const openid = getApp().globalData.openid
      const list = (res.result.data.list || []).map(m => ({
        id: m._id,
        isSelf: m.from === openid,
        content: m.content || '',
        timeText: relativeTime(m.create_time)
      }))
      this.setData({ messages: list })
      // 滚动到底部
      wx.nextTick(() => {
        wx.pageScrollTo({ scrollTop: 99999, duration: 0 })
      })
    } catch (err) {
      console.error('[chat loadMessages] 失败：', err)
      showError('加载消息失败')
    } finally {
      this.setData({ loading: false })
    }
  },

  // ==================== 标记该会话已读 ====================
  markRead() {
    wx.cloud.callFunction({
      name: 'message',
      data: { action: 'markRead', peer: this.data.peer }
    }).catch(err => console.error('[chat markRead] 失败：', err))
  },

  onInput(e) {
    this.setData({ inputText: e.detail.value })
  },

  // ==================== 发送消息 ====================
  async onSend() {
    const text = (this.data.inputText || '').trim()
    if (!text || this.data.sending) return

    this.setData({ sending: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'message',
        data: { action: 'send', to: this.data.peer, content: text }
      })

      if (res.result.code !== 0) {
        wx.showToast({ title: res.result.message || '发送失败', icon: 'none' })
        return
      }

      // 本地追加（服务端用 serverDate，本地用当前时间显示）
      const openid = getApp().globalData.openid
      this.setData({
        inputText: '',
        messages: [
          ...this.data.messages,
          {
            id: 'local-' + Date.now(),
            isSelf: true,
            content: text,
            timeText: '刚刚'
          }
        ]
      })
      wx.nextTick(() => {
        wx.pageScrollTo({ scrollTop: 99999, duration: 0 })
      })
    } catch (err) {
      console.error('[chat onSend] 失败：', err)
      wx.showToast({ title: '发送失败', icon: 'none' })
    } finally {
      this.setData({ sending: false })
    }
  }
})
