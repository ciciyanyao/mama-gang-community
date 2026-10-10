// pages/message/message.js —— 消息列表（F1 按帖子聚合展示 + F2 TabBar 红点）
const db = wx.cloud.database()
const _ = db.command
const { relativeTime, showError } = require('../../utils/util.js')

const PAGE_SIZE = 20

Page({
  data: {
    // 消息列表（按帖子聚合）
    messageList: [],
    // 分页
    page: 0,
    noMore: false,
    loading: false,
    // 空状态
    isEmpty: false
  },

  onLoad() {
    this.loadMessages(true)
  },

  onShow() {
    // 自定义 tabBar：同步当前选中 tab
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 })
    }

    // F2：进入消息页即标记已读，隐藏红点
    this._markAllRead()
  },

  // ==================== F1 加载消息列表 ====================
  async loadMessages(reset) {
    if (this.data.loading) return

    const page = reset ? 0 : this.data.page
    this.setData({ loading: true })

    try {
      // 1. 获取当前用户发布的帖子 id 列表
      const myPostsRes = await db.collection('posts')
        .where({ status: 1 })
        .field({ _id: true, title: true })
        .get()

      const myPosts = myPostsRes.data
      if (myPosts.length === 0) {
        this.setData({
          messageList: [],
          isEmpty: true,
          loading: false,
          noMore: true
        })
        return
      }

      const postIds = myPosts.map(p => p._id)
      const postMap = {}
      myPosts.forEach(p => { postMap[p._id] = p.title })

      // 2. 获取这些帖子下别人发的评论（排除自己的）
      const skip = page * PAGE_SIZE
      const commentsRes = await db.collection('comments')
        .where({
          postId: _.in(postIds),
          status: 1
        })
        .orderBy('create_time', 'desc')
        .skip(skip)
        .limit(PAGE_SIZE * 5) // 取多一些以便聚合后仍有足够数据
        .get()

      // 3. 按 postId 聚合
      const groupMap = {}
      commentsRes.data.forEach(comment => {
        if (!groupMap[comment.postId]) {
          groupMap[comment.postId] = {
            postId: comment.postId,
            postTitle: postMap[comment.postId] || '帖子已删除',
            comments: [],
            lastTime: comment.create_time,
            unreadCount: 0
          }
        }
        const group = groupMap[comment.postId]
        group.comments.push(comment)
        // 更新最后评论时间
        if (comment.create_time > group.lastTime) {
          group.lastTime = comment.create_time
        }
        // 未读计数
        if (!comment.is_read) {
          group.unreadCount++
        }
      })

      // 转为数组，按最后评论时间排序
      const newMessages = Object.values(groupMap)
        .sort((a, b) => new Date(b.lastTime) - new Date(a.lastTime))
        .map(item => ({
          ...item,
          lastTimeText: relativeTime(item.lastTime),
          commentCount: item.comments.length,
          // 取最新 2 条评论做预览
          previewComments: item.comments.slice(0, 2)
        }))

      const messageList = reset ? newMessages : [...this.data.messageList, ...newMessages]

      this.setData({
        messageList,
        page: page + 1,
        noMore: commentsRes.data.length < PAGE_SIZE * 5,
        isEmpty: messageList.length === 0,
        loading: false
      })
    } catch (err) {
      console.error('[loadMessages] 失败：', err)
      showError('加载消息失败')
      this.setData({ loading: false })
    }
  },

  // ==================== F2 标记所有消息已读 ====================
  async _markAllRead() {
    try {
      // 获取当前用户帖子 id
      const myPostsRes = await db.collection('posts')
        .where({ status: 1 })
        .field({ _id: true })
        .get()

      const postIds = myPostsRes.data.map(p => p._id)
      if (postIds.length === 0) return

      // 将这些帖子下未读评论标记为已读
      await db.collection('comments')
        .where({
          postId: _.in(postIds),
          status: 1,
          is_read: _.neq(true)
        })
        .update({
          data: { is_read: true }
        })

      // 隐藏自定义 tabBar 红点
      const tab = this.getTabBar && this.getTabBar()
      if (tab) {
        tab.setData({ 'list[1].badge': 0 })
      }
    } catch (err) {
      console.error('[markAllRead] 失败：', err)
    }
  },

  // ==================== 下拉刷新 ====================
  onPullDownRefresh() {
    this.loadMessages(true).then(() => {
      wx.stopPullDownRefresh()
    })
  },

  // ==================== 上拉触底加载更多 ====================
  onReachBottom() {
    if (!this.data.noMore && !this.data.loading) {
      this.loadMessages(false)
    }
  },

  // ==================== 点击消息 → 帖子详情 ====================
  onMessageTap(e) {
    const postId = e.currentTarget.dataset.postId
    if (!postId) return
    wx.navigateTo({ url: `/pages/post-detail/post-detail?id=${postId}` })
  }
})