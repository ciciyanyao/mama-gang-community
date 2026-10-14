// pages/index/index.js —— 论坛首页
// 融合版：main 数据库逻辑（真实数据） + 压缩包 UI（功能宫格 / 日历撕页热门榜 / post-card 组件）
// 登录：点赞需登录（auth.requireLogin 弹窗）；游客可浏览列表/热门榜
const db = wx.cloud.database()
const _ = db.command
const POSTS = db.collection('posts')
const { requireLogin } = require('../../utils/auth.js')
const { resolveTempUrls, applyUrlMap } = require('../../utils/image-url.js')

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

  // ==================== 帖子列表（真实数据 → post-card 组件字段） ====================
  async loadPosts(reset) {
    if (this.data.loading) return

    const page = reset ? 0 : this.data.page
    this.setData({ loading: true })

    try {
      const skip = page * PAGE_SIZE
      const where = { status: _.neq(-1) }
      const catIndex = this.data.currentCategory
      if (catIndex > 0) {
        where.category = CATEGORIES[catIndex]
      }

      // 查询帖子：创建时间倒序（置顶已移除，热门榜替代）
      const res = await POSTS
        .where(where)
        .orderBy('create_time', 'desc')
        .skip(skip)
        .limit(PAGE_SIZE)
        .get()

      // 批量查询当前用户点赞状态（likes 集合），避免 N+1
      let likedSet = new Set()
      const openid = getApp().globalData.openid
      if (openid && res.data.length > 0) {
        const ids = res.data.map(p => p._id)
        const likeRes = await db.collection('likes')
          .where({ _openid: openid, postId: _.in(ids) })
          .field({ postId: true })
          .get()
        likedSet = new Set(likeRes.data.map(l => l.postId))
      }

      // 字段映射：post-card 组件期望 authorName/authorAvatar/likeCount/commentCount/createTimeStr/isLiked
      const newList = res.data.map(post => ({
        ...post,
        authorName: post.authorName || post.nickname || '',
        authorAvatar: post.authorAvatar || post.avatar || '',
        likeCount: post.likeCount || 0,
        commentCount: post.commentCount || 0,
        createTimeStr: this._formatTime(post.create_time),
        isLiked: likedSet.has(post._id)
      }))

      // 云存储 fileID → 临时 https 链接（帖子图片 + 作者头像）
      const cloudIDs = []
      newList.forEach(p => {
        (p.images || []).forEach(id => { if (id && id.indexOf('cloud://') === 0) cloudIDs.push(id) })
        if (p.authorAvatar && p.authorAvatar.indexOf('cloud://') === 0) cloudIDs.push(p.authorAvatar)
      })
      if (cloudIDs.length > 0) {
        const { map } = await resolveTempUrls(cloudIDs)
        newList.forEach(p => {
          p.images = (p.images || []).map(id => (map[id] || id))
          if (p.authorAvatar && map[p.authorAvatar]) p.authorAvatar = map[p.authorAvatar]
        })
      }

      const posts = reset ? newList : [...this.data.posts, ...newList]

      this.setData({
        posts,
        page: page + 1,
        noMore: newList.length < PAGE_SIZE,
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
