// pages/message/message.js —— 消息页（融合版：小红书式结构 + 真实数据）
// 评论 Tab：comment 云函数 messageList（按帖子聚合、联表作者信息）
// 赞 Tab：likes 集合（我的帖子被赞）+ users 联表昵称头像
// 系统通知 Tab：暂无数据源，显示空态
// 未读：评论用 is_read 字段（进入即 markRead）；点赞用本地上次读取时间
const db = wx.cloud.database()
const _ = db.command
const { relativeTime, showError } = require('../../utils/util.js')

// 点赞消息"已读"时间戳 storage key
const LIKE_READ_KEY = 'msg_like_read_time'

Page({
  data: {
    // 消息类型 tab（参考小红书：评论/赞/系统通知）
    msgTabs: [
      { key: 'comment', name: '评论' },
      { key: 'like', name: '赞' },
      { key: 'system', name: '系统通知' }
    ],
    currentTab: 0,

    // 消息数据：每个 tab 按 今天/更早 分组
    messages: {
      comment: { today: [], earlier: [] },
      like: { today: [], earlier: [] },
      system: { today: [], earlier: [] }
    },

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

    // 进入消息页：评论标记已读 + 记录点赞已读时间 + 隐藏 tabBar 红点
    this._markCommentsRead()
    wx.setStorageSync(LIKE_READ_KEY, Date.now())
    const tab = this.getTabBar && this.getTabBar()
    if (tab) {
      tab.setData({ 'list[1].badge': 0 })
    }
  },

  // ==================== 切换 Tab ====================
  onTapTab(e) {
    const index = e.currentTarget.dataset.index
    if (index === this.data.currentTab) return
    this.setData({ currentTab: index })
  },

  // ==================== 加载全部消息（评论 + 点赞） ====================
  async loadMessages() {
    if (this.data.loading) return
    this.setData({ loading: true })
    try {
      await Promise.all([this._loadComments(), this._loadLikes()])
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

  // ==================== 评论消息：调 comment 云函数 messageList ====================
  async _loadComments() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'comment',
        data: { action: 'messageList', page: 1, pageSize: 20 }
      })

      if (res.result.code !== 0) {
        this.setData({ 'messages.comment': { today: [], earlier: [] } })
        return
      }

      const list = res.result.data.list || []
      const items = []
      list.forEach(group => {
        (group.comments || []).forEach(c => {
          items.push({
            id: c._id,
            avatar: (c.authorInfo && c.authorInfo.avatar) || '',
            name: (c.authorInfo && c.authorInfo.nickname) || '匿名用户',
            action: '评论了你的帖子',
            content: c.content || '',
            postTitle: group.postTitle || '',
            timeText: relativeTime(c.create_time),
            rawTime: c.create_time ? new Date(c.create_time).getTime() : Date.now(),
            isRead: !!c.is_read,
            postId: group.postId
          })
        })
      })

      const { today, earlier } = this._splitTodayEarlier(items)
      this.setData({ 'messages.comment': { today, earlier } })
    } catch (err) {
      console.error('[loadComments] 失败：', err)
      this.setData({ 'messages.comment': { today: [], earlier: [] } })
    }
  },

  // ==================== 点赞消息：likes 集合 + users 联表 ====================
  async _loadLikes() {
    const empty = { today: [], earlier: [] }
    try {
      const openid = getApp().globalData.openid

      // 1. 我的帖子（未删除的）
      const myPostsRes = await db.collection('posts')
        .where({ authorId: openid, status: _.neq(-1) })
        .field({ _id: true, title: true })
        .get()
      const myPosts = myPostsRes.data
      if (myPosts.length === 0) {
        this.setData({ 'messages.like': empty })
        return
      }

      const ids = myPosts.map(p => p._id)
      const titleMap = {}
      myPosts.forEach(p => { titleMap[p._id] = p.title })

      // 2. 这些帖子收到的赞（likes 集合，按时间倒序取最近 100 条）
      const likeRes = await db.collection('likes')
        .where({ postId: _.in(ids) })
        .orderBy('create_time', 'desc')
        .limit(100)
        .get()
      if (likeRes.data.length === 0) {
        this.setData({ 'messages.like': empty })
        return
      }

      // 3. 联表点赞者信息（users 集合）
      const likerOpenids = [...new Set(likeRes.data.map(l => l._openid).filter(Boolean))]
      let userMap = {}
      if (likerOpenids.length > 0) {
        const userRes = await db.collection('users')
          .where({ openid: _.in(likerOpenids) })
          .get()
        userRes.data.forEach(u => { userMap[u.openid] = u })
      }

      // 4. 组装消息项（未读判断：点赞时间 > 上次进入消息页时间）
      const lastRead = wx.getStorageSync(LIKE_READ_KEY) || 0
      const items = likeRes.data.map(l => ({
        id: l._id,
        avatar: userMap[l._openid] ? (userMap[l._openid].avatar || '') : '',
        name: userMap[l._openid] ? (userMap[l._openid].nickname || '匿名用户') : '匿名用户',
        action: '赞了你的帖子',
        content: '',
        postTitle: titleMap[l.postId] || '帖子已删除',
        timeText: relativeTime(l.create_time),
        rawTime: l.create_time ? new Date(l.create_time).getTime() : Date.now(),
        isRead: l.create_time ? new Date(l.create_time).getTime() <= lastRead : true,
        postId: l.postId
      }))

      const { today, earlier } = this._splitTodayEarlier(items)
      this.setData({ 'messages.like': { today, earlier } })
    } catch (err) {
      console.error('[loadLikes] 失败：', err)
      this.setData({ 'messages.like': empty })
    }
  },

  // ==================== 按"今天 / 更早"分组 ====================
  _splitTodayEarlier(items) {
    const today = []
    const earlier = []
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()

    items.forEach(item => {
      if (item.rawTime >= todayStart) {
        today.push(item)
      } else {
        earlier.push(item)
      }
    })
    return { today, earlier }
  },

  // ==================== 评论标记已读（云函数，服务端权限） ====================
  async _markCommentsRead() {
    try {
      await wx.cloud.callFunction({
        name: 'comment',
        data: { action: 'markRead' }
      })
      // 本地同步刷新评论 Tab 的未读状态
      const comment = this.data.messages.comment
      const mark = (list) => list.map(m => ({ ...m, isRead: true }))
      this.setData({
        'messages.comment.today': mark(comment.today),
        'messages.comment.earlier': mark(comment.earlier)
      })
    } catch (err) {
      console.error('[markCommentsRead] 失败：', err)
    }
  },

  // ==================== 点击消息 → 帖子详情 ====================
  onTapMessage(e) {
    const postId = e.currentTarget.dataset.postid
    if (!postId) return
    wx.navigateTo({ url: `/pages/post-detail/post-detail?id=${postId}` })
  }
})
