// pages/index/index.js —— 论坛首页
const { requireLogin } = require('../../utils/auth.js')

const db = wx.cloud.database()
const _ = db.command
const POSTS = db.collection('posts')

const PAGE_SIZE = 20
const CATEGORIES = ['全部', '求职交流', '职场经验', '育儿互助', '情绪倾诉', '政策资讯']

// 功能宫格（图标已改为简笔画风格类名）
const GRID_ITEMS = [
  { id: 'cases', icon: 'icon-cases', name: '案例库', url: '/subpkg/cases/cases' },
  { id: 'policy', icon: 'icon-policy', name: '政策资讯', url: '' },
  { id: 'jobs', icon: 'icon-jobs', name: '招聘', url: '' },
  { id: 'help', icon: 'icon-help', name: '互助', url: '' }
]

Page({
  data: {
    categories: CATEGORIES,
    currentCategory: 0,
    hotPosts: [],
    gridItems: GRID_ITEMS,
    posts: [],
    page: 0,
    noMore: false,
    loading: false,
    isEmpty: false
  },

  onLoad() {
    this.loadHotPosts()
    this.loadPosts(true)
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 })
    }
  },

  onPullDownRefresh() {
    Promise.all([
      this.loadHotPosts(),
      this.loadPosts(true)
    ]).finally(() => {
      wx.stopPullDownRefresh()
    })
  },

  onReachBottom() {
    if (!this.data.noMore && !this.data.loading) {
      this.loadPosts(false)
    }
  },

  onTapCategory(e) {
    const idx = e.currentTarget.dataset.index
    if (idx === this.data.currentCategory) return
    this.setData({ currentCategory: idx })
    this.loadPosts(true)
  },

  onTapGrid(e) {
    const { url } = e.currentTarget.dataset
    if (url) {
      wx.navigateTo({ url })
    } else {
      wx.showToast({ title: '开发中', icon: 'none' })
    }
  },

  async loadHotPosts() {
    try {
      // 置顶帖（is_top）永远排第一，其余按点赞数降序；多拉一些，前端按标题去重后再取前 10
      const res = await POSTS
        .where({ status: _.neq(-1) })
        .orderBy('is_top', 'desc')
        .orderBy('likeCount', 'desc')
        .limit(20)
        .field({ title: true, likeCount: true, commentCount: true, _id: true })
        .get()

      const seen = new Set()
      const hotPosts = []
      for (const item of res.data) {
        const key = (item.title || '').trim()
        if (!key || seen.has(key)) continue // 跳过空标题和重复标题
        seen.add(key)
        hotPosts.push({
          _id: item._id,
          title: item.title,
          heat: (item.likeCount || 0) + (item.commentCount || 0)
        })
        if (hotPosts.length >= 10) break
      }
      this.setData({ hotPosts })
    } catch (err) {
      console.error('[loadHotPosts] 失败：', err)
    }
  },

  async loadPosts(reset) {
    if (this.data.loading) return
    const page = reset ? 1 : this.data.page + 1
    this.setData({ loading: true })

    try {
      const catIndex = this.data.currentCategory
      const category = catIndex > 0 ? CATEGORIES[catIndex] : '全部'

      const res = await wx.cloud.callFunction({
        name: 'post',
        data: { action: 'list', page, pageSize: PAGE_SIZE, category }
      })

      if (res.result.code !== 0) throw new Error(res.result.message || '加载失败')

      const { list, hasMore } = res.result.data
      const newList = list.map(post => ({
        ...post,
        authorName: post.authorName || '',
        authorAvatar: post.authorAvatar || '',
        likeCount: post.likeCount || 0,
        commentCount: post.commentCount || 0,
        createTimeStr: this._formatTime(post.create_time),
        isLiked: !!post.isLiked
      }))

      const posts = reset ? newList : [...this.data.posts, ...newList]
      this.setData({
        posts,
        page,
        noMore: !hasMore,
        isEmpty: posts.length === 0,
        loading: false
      })
    } catch (err) {
      console.error('[loadPosts] 失败：', err)
      wx.showToast({ title: '加载失败', icon: 'none' })
      this.setData({ loading: false })
    }
  },

  async onPostLike(e) {
    const { postId } = e.detail
    if (!postId || !requireLogin(this)) return
    try {
      const res = await wx.cloud.callFunction({ name: 'post', data: { action: 'like', postId } })
      if (res.result.code === 0) {
        const liked = res.result.data && res.result.data.liked
        const posts = this.data.posts.map(p => {
          if (p._id !== postId) return p
          const cur = p.likeCount || 0
          return { ...p, isLiked: liked, likeCount: liked ? cur + 1 : Math.max(0, cur - 1) }
        })
        this.setData({ posts })
      } else {
        wx.showToast({ title: res.result.message || '操作失败', icon: 'none' })
      }
    } catch (err) {
      console.error('[onPostLike] 失败：', err)
      wx.showToast({ title: '操作失败', icon: 'none' })
    }
  },

  async onPostFavorite(e) {
    const { postId } = e.detail
    if (!postId || !requireLogin(this)) return
    try {
      const posts = this.data.posts.map(p => {
        if (p._id !== postId) return p
        const cur = p.isFavorited
        return { ...p, isFavorited: !cur, favoriteCount: (p.favoriteCount || 0) + (cur ? -1 : 1) }
      })
      this.setData({ posts })

      const res = await wx.cloud.callFunction({
        name: 'favorite',
        data: { action: posts.find(p => p._id === postId).isFavorited ? 'add' : 'remove', postId }
      })

      if (res.result.code !== 0) {
        const rollback = this.data.posts.map(p => {
          if (p._id !== postId) return p
          const cur = p.isFavorited
          return { ...p, isFavorited: !cur, favoriteCount: (p.favoriteCount || 0) + (cur ? -1 : 1) }
        })
        this.setData({ posts: rollback })
        wx.showToast({ title: res.result.message || '操作失败', icon: 'none' })
      }
    } catch (err) {
      console.error('[onPostFavorite] 失败：', err)
      const rollback = this.data.posts.map(p => {
        if (p._id !== postId) return p
        const cur = p.isFavorited
        return { ...p, isFavorited: !cur, favoriteCount: (p.favoriteCount || 0) + (cur ? -1 : 1) }
      })
      this.setData({ posts: rollback })
      wx.showToast({ title: '操作失败', icon: 'none' })
    }
  },

  onLoginSuccess() { this.loadPosts(true) },

  onHotTap(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    wx.navigateTo({ url: `/subpkg/post-detail/post-detail?id=${id}` })
  },

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
    const M = (date.getMonth() + 1).toString().padStart(2, '0')
    const D = date.getDate().toString().padStart(2, '0')
    return `${M}-${D}`
  }
})