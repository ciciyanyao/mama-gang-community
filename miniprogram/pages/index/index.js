// pages/index/index.js —— 论坛首页
const { requireLogin } = require('../../utils/auth.js')

// 数据库初始化（loadHotPosts 直读 posts 集合用）
const db = wx.cloud.database()
const _ = db.command
const POSTS = db.collection('posts')

const PAGE_SIZE = 20
const CATEGORIES = ['全部', '求职交流', '职场经验', '育儿互助', '情绪倾诉', '政策资讯']

// 功能宫格：案例库有真实页面，其余未实现 → toast"开发中"
const GRID_ITEMS = [
  { id: 'cases', icon: '📚', name: '案例库', url: '/subpkg/cases/cases' },
  { id: 'policy', icon: '📋', name: '政策资讯', url: '' },
  { id: 'jobs', icon: '💼', name: '招聘', url: '' },
  { id: 'help', icon: '🤝', name: '互助', url: '' }
]

Page({
  data: {
    categories: CATEGORIES,
    currentCategory: 0,

    // 热门榜（真实 top10，接数据库）
    hotPosts: [],

    // 功能宫格
    gridItems: GRID_ITEMS,

    // 帖子列表（post-card 组件数据）
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
    // 自定义 tabBar：同步当前选中 tab
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 })
    }
  },

  // ==================== 下拉刷新 ====================
  onPullDownRefresh() {
    Promise.all([
      this.loadHotPosts(),
      this.loadPosts(true)
    ]).finally(() => {
      wx.stopPullDownRefresh()
    })
  },

  // ==================== 上拉触底加载更多 ====================
  onReachBottom() {
    if (!this.data.noMore && !this.data.loading) {
      this.loadPosts(false)
    }
  },

  // ==================== 切换板块分类 ====================
  onTapCategory(e) {
    const idx = e.currentTarget.dataset.index
    if (idx === this.data.currentCategory) return
    this.setData({ currentCategory: idx })
    this.loadPosts(true)
  },

  // ==================== 点击功能宫格 ====================
  onTapGrid(e) {
    const { url } = e.currentTarget.dataset
    if (url) {
      wx.navigateTo({ url })
    } else {
      wx.showToast({ title: '开发中', icon: 'none' })
    }
  },

  // ==================== 热门榜：加载真实 top 10 ====================
  async loadHotPosts() {
    try {
      // 按点赞数降序取前 10，热度 = 点赞 + 评论
      const res = await POSTS
        .where({ status: _.neq(-1) }) // 排除已删除
        .orderBy('likeCount', 'desc')
        .limit(10)
        .field({
          title: true,
          likeCount: true,
          commentCount: true,
          _id: true
        })
        .get()

      const hotPosts = res.data.map((item) => ({
        _id: item._id,
        title: item.title || '未命名帖子',
        heat: (item.likeCount || 0) + (item.commentCount || 0)
      }))

      this.setData({ hotPosts })
    } catch (err) {
      console.error('[loadHotPosts] 失败：', err)
    }
  },

  // ==================== 帖子列表（走 post 云函数 list） ====================
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

      if (res.result.code !== 0) {
        throw new Error(res.result.message || '加载失败')
      }

      const { list, hasMore } = res.result.data

      // 字段映射：post-card 组件期望的格式
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

  // ==================== 点赞（需登录） ====================
  async onPostLike(e) {
    const { postId } = e.detail
    if (!postId) return

    // 未登录 → 弹登录窗（与全局权限设计一致：点赞需登录）
    if (!requireLogin(this)) return

    try {
      const res = await wx.cloud.callFunction({
        name: 'post',
        data: { action: 'like', postId }
      })

      if (res.result.code === 0) {
        const liked = res.result.data && res.result.data.liked
        // 更新本地点赞状态与计数
        const posts = this.data.posts.map(p => {
          if (p._id !== postId) return p
          const cur = p.likeCount || 0
          return {
            ...p,
            isLiked: liked,
            likeCount: liked ? cur + 1 : Math.max(0, cur - 1)
          }
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

  // ==================== 收藏/取消收藏 ====================
  async onPostFavorite(e) {
    const { postId } = e.detail
    if (!postId) return

    if (!requireLogin(this)) return

    try {
      const posts = this.data.posts.map(p => {
        if (p._id !== postId) return p
        const cur = p.isFavorited
        return {
          ...p,
          isFavorited: !cur,
          favoriteCount: (p.favoriteCount || 0) + (cur ? -1 : 1)
        }
      })
      this.setData({ posts })

      const res = await wx.cloud.callFunction({
        name: 'favorite',
        data: { action: posts.find(p => p._id === postId).isFavorited ? 'add' : 'remove', postId }
      })

      if (res.result.code !== 0) {
        // 回滚
        const rollback = this.data.posts.map(p => {
          if (p._id !== postId) return p
          const cur = p.isFavorited
          return {
            ...p,
            isFavorited: !cur,
            favoriteCount: (p.favoriteCount || 0) + (cur ? -1 : 1)
          }
        })
        this.setData({ posts: rollback })
        wx.showToast({ title: res.result.message || '操作失败', icon: 'none' })
      }
    } catch (err) {
      console.error('[onPostFavorite] 失败：', err)
      const rollback = this.data.posts.map(p => {
        if (p._id !== postId) return p
        const cur = p.isFavorited
        return {
          ...p,
          isFavorited: !cur,
          favoriteCount: (p.favoriteCount || 0) + (cur ? -1 : 1)
        }
      })
      this.setData({ posts: rollback })
      wx.showToast({ title: '操作失败', icon: 'none' })
    }
  },

  // ==================== 登录弹窗成功回调 ====================
  // 登录后重新加载列表，刷新 isLiked 状态（点赞需登录，登录成功后可再次操作）
  onLoginSuccess() {
    this.loadPosts(true)
  },

  // ==================== 点击热门帖 → 详情 ====================
  onHotTap(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    wx.navigateTo({ url: `/subpkg/post-detail/post-detail?id=${id}` })
  },

  // ==================== 工具函数：格式化时间 ====================
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
