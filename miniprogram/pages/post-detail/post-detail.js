// pages/post-detail/post-detail.js —— 帖子详情页
const db = wx.cloud.database()
const _ = db.command
const POSTS = db.collection('posts')
const COMMENTS = db.collection('comments')
const FAVORITES = db.collection('favorites')

Page({
  data: {
    // 帖子详情
    post: null,
    postId: '',
    loading: true,

    // 评论
    comments: [],
    commentCount: 0,
    commentLoading: false,

    // 交互状态
    isLiked: false,
    isFavorited: false,
    likeCount: 0,

    // 评论输入
    commentText: '',
    inputFocused: false,
    replyTo: null, // 回复目标 { commentId, nickname }

    // 图片预览
    previewImages: []
  },

  onLoad(options) {
    const { id } = options
    if (!id) {
      wx.showToast({ title: '帖子不存在', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 1500)
      return
    }

    this.setData({ postId: id })
    this.loadPostDetail(id)
    this.loadComments(id)
    this.checkFavoriteStatus(id)
  },

  // ==================== 加载帖子详情 ====================
  async loadPostDetail(id) {
    this.setData({ loading: true })
    try {
      const res = await POSTS.doc(id).get()
      const post = res.data

      // 格式化时间
      post.timeText = this._formatTime(post.create_time)

      // 检查当前用户是否已点赞
      const app = getApp()
      const openid = app.globalData.openid
      const isLiked = openid && post.liked_users && post.liked_users.includes(openid)

      this.setData({
        post,
        likeCount: post.likes || 0,
        isLiked: !!isLiked,
        previewImages: post.images || []
      })

      // 更新页面标题
      wx.setNavigationBarTitle({ title: post.title || '帖子详情' })
    } catch (err) {
      console.error('[loadPostDetail] 失败：', err)
      wx.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  },

  // ==================== 加载评论列表 ====================
  async loadComments(postId) {
    this.setData({ commentLoading: true })
    try {
      const res = await COMMENTS
        .where({ post_id: postId, status: _.neq(-1) })
        .orderBy('create_time', 'asc')
        .limit(100)
        .get()

      const comments = res.data.map(c => ({
        ...c,
        timeText: this._formatTime(c.create_time)
      }))

      this.setData({
        comments,
        commentCount: comments.length
      })
    } catch (err) {
      console.error('[loadComments] 失败：', err)
    } finally {
      this.setData({ commentLoading: false })
    }
  },

  // ==================== 检查收藏状态 ====================
  async checkFavoriteStatus(postId) {
    try {
      const res = await FAVORITES
        .where({ post_id: postId })
        .count()

      this.setData({ isFavorited: res.total > 0 })
    } catch (err) {
      console.error('[checkFavoriteStatus] 失败：', err)
    }
  },

  // ==================== 点赞/取消点赞 ====================
  async onLikeTap() {
    const { postId, isLiked, likeCount } = this.data
    const app = getApp()
    const openid = app.globalData.openid

    if (!openid) {
      wx.showToast({ title: '请先登录', icon: 'none' })
      return
    }

    // 乐观更新 UI
    this.setData({
      isLiked: !isLiked,
      likeCount: isLiked ? likeCount - 1 : likeCount + 1
    })

    try {
      if (isLiked) {
        // 取消点赞
        await POSTS.doc(postId).update({
          data: {
            likes: _.inc(-1),
            engagement: _.inc(-1),
            liked_users: _.pull(openid)
          }
        })
      } else {
        // 点赞
        await POSTS.doc(postId).update({
          data: {
            likes: _.inc(1),
            engagement: _.inc(1),
            liked_users: _.push(openid)
          }
        })
      }
    } catch (err) {
      console.error('[onLikeTap] 失败：', err)
      // 回滚 UI
      this.setData({ isLiked, likeCount })
      wx.showToast({ title: '操作失败', icon: 'none' })
    }
  },

  // ==================== 收藏/取消收藏 ====================
  async onFavoriteTap() {
    const { postId, isFavorited } = this.data

    // 乐观更新
    this.setData({ isFavorited: !isFavorited })

    try {
      if (isFavorited) {
        // 取消收藏
        await FAVORITES.where({ post_id: postId }).remove()
        wx.showToast({ title: '已取消收藏', icon: 'none' })
      } else {
        // 收藏
        await FAVORITES.add({
          data: {
            post_id: postId,
            create_time: db.serverDate()
          }
        })
        wx.showToast({ title: '已收藏', icon: 'success' })
      }
    } catch (err) {
      console.error('[onFavoriteTap] 失败：', err)
      // 回滚
      this.setData({ isFavorited })
      wx.showToast({ title: '操作失败', icon: 'none' })
    }
  },

  // ==================== 评论输入 ====================
  onCommentInput(e) {
    this.setData({ commentText: e.detail.value })
  },

  onCommentFocus() {
    this.setData({ inputFocused: true })
  },

  onCommentBlur() {
    // 延迟隐藏，避免点击发送按钮时先失焦
    setTimeout(() => {
      this.setData({ inputFocused: false })
    }, 150)
  },

  // 点击评论的回复按钮
  onReplyTap(e) {
    const { commentid, nickname } = e.currentTarget.dataset
    this.setData({
      replyTo: { commentId: commentid, nickname },
      inputFocused: true
    })
  },

  // 取消回复
  onCancelReply() {
    this.setData({ replyTo: null })
  },

  // ==================== 提交评论 ====================
  async onSubmitComment() {
    const { commentText, postId, replyTo } = this.data
    const text = commentText.trim()

    if (!text) {
      wx.showToast({ title: '请输入评论内容', icon: 'none' })
      return
    }

    wx.showLoading({ title: '发送中...', mask: true })

    try {
      const commentData = {
        post_id: postId,
        content: text,
        create_time: db.serverDate(),
        status: 0 // 0=正常, -1=已删除
      }

      // 如果是回复某条评论
      if (replyTo) {
        commentData.reply_to = replyTo.commentId
        commentData.reply_nickname = replyTo.nickname
      }

      await COMMENTS.add({ data: commentData })

      // 更新帖子评论计数
      await POSTS.doc(postId).update({
        data: {
          comment_count: _.inc(1),
          engagement: _.inc(1)
        }
      })

      wx.hideLoading()
      wx.showToast({ title: '评论成功', icon: 'success' })

      // 清空输入并刷新评论
      this.setData({
        commentText: '',
        replyTo: null
      })
      this.loadComments(postId)

      // 更新帖子评论数
      if (this.data.post) {
        this.setData({
          'post.comment_count': (this.data.post.comment_count || 0) + 1
        })
      }
    } catch (err) {
      wx.hideLoading()
      console.error('[onSubmitComment] 失败：', err)
      wx.showToast({ title: '评论失败', icon: 'none' })
    }
  },

  // ==================== 图片预览 ====================
  onImagePreview(e) {
    const { src } = e.currentTarget.dataset
    wx.previewImage({
      current: src,
      urls: this.data.previewImages
    })
  },

  // ==================== 分享 ====================
  onShareAppMessage() {
    const { post } = this.data
    return {
      title: post ? post.title : '来自妈妈岗社区的帖子',
      path: `/pages/post-detail/post-detail?id=${this.data.postId}`
    }
  },

  // ==================== 工具函数 ====================
  _formatTime(timestamp) {
    if (!timestamp) return ''
    const date = timestamp instanceof Date ? timestamp : new Date(timestamp)
    const now = Date.now()
    const diff = now - date.getTime()

    const minute = 60 * 1000
    const hour = 60 * minute
    const day = 24 * hour

    if (diff < minute) return '刚刚'
    if (diff < hour) return Math.floor(diff / minute) + '分钟前'
    if (diff < day) return Math.floor(diff / hour) + '小时前'
    if (diff < 7 * day) return Math.floor(diff / day) + '天前'

    const Y = date.getFullYear()
    const M = (date.getMonth() + 1).toString().padStart(2, '0')
    const D = date.getDate().toString().padStart(2, '0')
    const h = date.getHours().toString().padStart(2, '0')
    const m = date.getMinutes().toString().padStart(2, '0')
    return `${Y}-${M}-${D} ${h}:${m}`
  }
})