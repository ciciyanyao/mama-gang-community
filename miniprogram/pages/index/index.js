// pages/index/index.js —— 论坛首页（B6 热门榜 + B7 置顶帖）
const db = wx.cloud.database()
const _ = db.command
const POSTS = db.collection('posts')
const PAGE_SIZE = 20

// 分类枚举，'全部' 不传 category 字段即为查全部
const CATEGORIES = ['全部', '求职交流', '职场经验', '育儿互助', '情绪倾诉', '政策资讯']

Page({
  data: {
    // 分类 tab
    categories: CATEGORIES,
    activeCategory: 0, // 当前选中的分类索引（0 = 全部）

    // 热门帖子（B6 热门榜）
    hotPosts: [],

    // 帖子列表（B7 置顶帖 + 普通帖）
    postList: [],
    page: 0,           // 当前分页页码（从 0 开始）
    noMore: false,      // 是否已加载全部
    loading: false,     // 列表加载中
    hotLoading: false,  // 热门加载中

    // 空状态
    isEmpty: false
  },

  onLoad() {
    this.loadHotPosts()
    this.loadPosts(true) // true = 首次加载，重置列表
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

  // ==================== B6 热门榜：加载 top 10 ====================
  async loadHotPosts() {
    this.setData({ hotLoading: true })
    try {
      // 热门排序：按 engagement（likes + comments）降序，取前 10
      const res = await POSTS
        .where({ status: _.neq(-1) }) // 排除已删除
        .orderBy('engagement', 'desc')
        .limit(10)
        .field({ // 只取需要的字段，减少传输
          title: true,
          likes: true,
          comment_count: true,
          _id: true
        })
        .get()

      const hotPosts = res.data.map((item, index) => ({
        ...item,
        rank: index + 1
      }))

      this.setData({ hotPosts })
    } catch (err) {
      console.error('[loadHotPosts] 失败：', err)
    } finally {
      this.setData({ hotLoading: false })
    }
  },

  // ==================== B7 帖子列表（含置顶） ====================
  async loadPosts(reset) {
    if (this.data.loading) return

    const page = reset ? 0 : this.data.page
    this.setData({ loading: true })

    try {
      const skip = page * PAGE_SIZE

      // 构造查询条件
      const where = { status: _.neq(-1) }
      const catIndex = this.data.activeCategory
      if (catIndex > 0) {
        // activeCategory > 0 表示选了具体分类（跳过"全部"）
        where.category = CATEGORIES[catIndex]
      }

      // 查询帖子：置顶帖优先，再按创建时间倒序
      const res = await POSTS
        .where(where)
        .orderBy('is_top', 'desc')
        .orderBy('create_time', 'desc')
        .skip(skip)
        .limit(PAGE_SIZE)
        .get()

      const newList = res.data.map(post => ({
        ...post,
        // 格式化时间为 "x分钟前 / x小时前 / MM-DD"
        timeText: this._formatTime(post.create_time),
        // 内容预览：截取前 80 字
        contentPreview: post.content ? post.content.substring(0, 80) : ''
      }))

      const postList = reset ? newList : [...this.data.postList, ...newList]

      this.setData({
        postList,
        page: page + 1,
        noMore: newList.length < PAGE_SIZE,
        isEmpty: postList.length === 0
      })
    } catch (err) {
      console.error('[loadPosts] 失败：', err)
      wx.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  },

  // ==================== 分类 tab 切换 ====================
  onCategoryTap(e) {
    const index = e.currentTarget.dataset.index
    if (index === this.data.activeCategory) return

    this.setData({ activeCategory: index })
    this.loadPosts(true) // 切换分类后重新加载
  },

  // ==================== 点击帖子 → 帖子详情 ====================
  onPostTap(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/post-detail/post-detail?id=${id}` })
  },

  // ==================== 点击热门帖子 → 帖子详情 ====================
  onHotTap(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/post-detail/post-detail?id=${id}` })
  },

  // ==================== 工具函数 ====================

  /**
   * 格式化时间戳为相对时间
   * @param {Date|number|string} timestamp
   * @returns {string}
   */
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

    // 超过 7 天显示日期
    const M = (date.getMonth() + 1).toString().padStart(2, '0')
    const D = date.getDate().toString().padStart(2, '0')
    return `${M}-${D}`
  }
})