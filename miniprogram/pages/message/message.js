// pages/message/message.js —— 消息页
const { relativeTime, showError } = require('../../utils/util.js')

Page({
  data: {
    // 视图：main = 主视图（三组件+私信）；likes / follows / comments = 三个子列表
    currentView: 'main',
    views: ['main', 'likes', 'follows', 'comments'],

    // 三组件角标（消息总数）
    badges: {
      likeFav: 0,
      follow: 0,
      comment: 0
    },

    // 私信会话列表（message.conversationList）
    conversations: [],

    // 点赞与收藏子列表（合并 likes + favorites，按时间倒序）
    likeFavList: [],

    // 新增关注子列表（follow.messageList）
    followList: [],

    // 评论子列表（comment.messageList，按帖子聚合）
    commentGroups: [],

    loading: false,
    loaded: false
  },

  onLoad() {
    this.loadMessages()
  },

  onShow() {
    // 自定义 tabBar：同步当前选中 tab
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 })
    }

    // 进入消息页：评论 + 点赞/收藏 + 关注 标记已读（私信在对话页内标记）
    this._markAllRead()
    // tabBar 红点清零（私信未读由对话页 markRead 后 tabBar 重新计算）
    const tab = this.getTabBar && this.getTabBar()
    if (tab) {
      tab.setData({ 'list[1].badge': 0 })
    }

    // 从对话页返回时刷新全部消息（可能新增私信/评论/点赞）
    if (this.data.loaded) {
      this.loadMessages()
    }
  },

  // ==================== 切换视图 ====================
  onTapEntry(e) {
    const view = e.currentTarget.dataset.view
    if (!this.data.views.includes(view)) return
    this.setData({ currentView: view })
  },

  onBackMain() {
    this.setData({ currentView: 'main' })
  },

  // ==================== 加载全部（1个云函数聚合 + 1个标记已读） ====================
  async loadMessages() {
    if (this.data.loading) return
    this.setData({ loading: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'notify',
        data: { action: 'getMessageCenter' }
      })

      if (res.result.code === 0) {
        const d = res.result.data
        this.setData({
          commentGroups: d.commentGroups || [],
          likeFavList: (d.likeFavList || []).map(item => ({
            ...item,
            timeText: relativeTime(item.create_time),
            rawTime: item.create_time ? new Date(item.create_time).getTime() : Date.now()
          })),
          followList: (d.followList || []).map(item => ({
            ...item,
            timeText: relativeTime(item.create_time),
            rawTime: item.create_time ? new Date(item.create_time).getTime() : Date.now()
          })),
          conversations: (d.conversations || []).map(c => ({
            ...c,
            lastTime: relativeTime(c.create_time)
          })),
          'badges.comment': (d.badges && d.badges.comment) || 0,
          'badges.likeFav': (d.badges && d.badges.likeFav) || 0,
          'badges.follow': (d.badges && d.badges.follow) || 0
        })
      }
      this.setData({ loaded: true })
    } catch (err) {
      console.error('[loadMessages] 失败：', err)
      showError('加载消息失败')
    } finally {
      this.setData({ loading: false })
    }
  },

  // ==================== 下拉刷新 ====================
  onPullDownRefresh() {
    this.loadMessages().then(() => {
      wx.stopPullDownRefresh()
    })
  },

  // ==================== 标记全部已读（1个云函数） ====================
  async _markAllRead() {
    try {
      await wx.cloud.callFunction({ name: 'notify', data: { action: 'markAllRead' } })
    } catch (err) {
      console.error('[markAllRead] 失败：', err)
    }
    // 本地同步刷新已读状态
    this._syncReadState()
  },

  // 本地把 评论/点赞收藏/关注 列表置为已读（视觉同步）
  _syncReadState() {
    const mark = (item) => ({ ...item, isRead: true })
    this.setData({
      'commentGroups': this.data.commentGroups.map(g => ({ ...g, comments: g.comments.map(mark) })),
      'likeFavList': this.data.likeFavList.map(mark),
      'followList': this.data.followList.map(mark)
    })
  },

  // ==================== 点击消息 → 帖子详情 ====================
  onTapMessage(e) {
    const postId = e.currentTarget.dataset.postid
    if (!postId) return
    wx.navigateTo({ url: `/subpkg/post-detail/post-detail?id=${postId}` })
  },

  // ==================== 点击私信 → 对话页 ====================
  onTapChat(e) {
    const { peer, nickname } = e.currentTarget.dataset
    if (!peer) return
    wx.navigateTo({
      url: `/subpkg/chat/chat?peer=${peer}&nickname=${encodeURIComponent(nickname || '')}`
    })
  }
})
