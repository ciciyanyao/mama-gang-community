// pages/mine/mine.js —— 我的页（小红书式：用户主页 + 帖子/点赞/收藏/树洞 四 Tab）
// 数据链路（全部真实数据，onShow 全量刷新保证与其它页面一致）：
//   用户信息：login.getUserInfo（云端最新）
//   数据行统计：login.getStats（关注/粉丝/获赞与收藏，服务端统计）
//   帖子 Tab：post.myPosts（我的非匿名帖）
//   点赞 Tab：likes 直读（默认权限自动限定本人）+ posts 联查
//   收藏 Tab：favorites 直读 + posts 联查
//   树洞 Tab：posts 直读（我的匿名帖）
const app = getApp()
const db = wx.cloud.database()
const _ = db.command
const auth = require('../../utils/auth.js')
const { showError, showSuccess, relativeTime } = require('../../utils/util.js')

Page({
  data: {
    // 用户信息
    userInfo: null,
    hasUserInfo: false,
    isAdmin: false,
    stats: { following: 0, followers: 0, likeFav: 0 },

    // 四 Tab
    tabs: ['帖子', '点赞', '收藏', '树洞'],
    currentTab: 0,

    // 各 Tab 数据
    posts: [],
    likedPosts: [],
    favoritePosts: [],
    treeHolePosts: [],

    loading: false,
    loaded: false
  },

  onShow() {
    // 自定义 tabBar：同步当前选中 tab
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 4 })
    }
    // 每次进入全量刷新（点赞/收藏/关注在别处变化后，这里保持一致）
    this.loadAll()
  },

  // ==================== 全量加载 ====================
  async loadAll() {
    if (this.data.loading) return
    this.setData({ loading: true })
    try {
      await Promise.all([
        this._loadUserInfo(),
        this._loadStats(),
        this._loadMyPosts(),
        this._loadLikedPosts(),
        this._loadFavoritePosts()
      ])
      this.setData({ loaded: true })
    } catch (err) {
      console.error('[mine loadAll] 失败：', err)
      showError('加载失败')
    } finally {
      this.setData({ loading: false })
    }
  },

  // ==================== 下拉刷新 ====================
  onPullDownRefresh() {
    this.loadAll().then(() => {
      wx.stopPullDownRefresh()
    })
  },

  // ==================== 用户信息（本地优先 + 云端最新） ====================
  async _loadUserInfo() {
    if (!auth.isLogin()) {
      app.globalData.userInfo = null
      this.setData({ userInfo: null, hasUserInfo: false, isAdmin: false })
      return
    }
    const local = auth.getUserInfo()
    const userInfo = {
      nickName: local.nickname || local.nickName || '妈妈岗用户',
      avatarUrl: local.avatar || local.avatarUrl || '',
      bio: local.bio || '',
      role: local.role || 0,
      avatarLetter: (local.nickname || local.nickName || '妈').charAt(0)
    }
    app.globalData.userInfo = userInfo
    this.setData({ userInfo, hasUserInfo: true, isAdmin: userInfo.role === 2 })

    try {
      const res = await wx.cloud.callFunction({ name: 'login', data: { action: 'getUserInfo' } })
      if (res.result && res.result.code === 0) {
        const user = res.result.data
        const fresh = {
          nickName: user.nickname || userInfo.nickName,
          avatarUrl: user.avatar || userInfo.avatarUrl,
          bio: user.bio || '',
          role: user.role || 0,
          avatarLetter: (user.nickname || userInfo.nickName).charAt(0)
        }
        app.globalData.userInfo = fresh
        this.setData({ userInfo: fresh, isAdmin: user.role === 2 })
      }
    } catch (err) {
      console.error('[mine] 加载用户信息失败：', err)
    }
  },

  // ==================== 数据行统计（login.getStats） ====================
  async _loadStats() {
    try {
      const res = await wx.cloud.callFunction({ name: 'login', data: { action: 'getStats' } })
      if (res.result && res.result.code === 0) {
        this.setData({ stats: res.result.data })
      }
    } catch (err) {
      console.error('[mine] 加载统计失败：', err)
    }
  },

  // ==================== 我的帖子（post.myPosts，拆 帖子/树洞） ====================
  async _loadMyPosts() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'post',
        data: { action: 'myPosts', page: 1, pageSize: 50 }
      })
      const list = (res.result && res.result.data && res.result.data.list) || []
      const posts = []
      const treeHolePosts = []
      list.forEach(p => {
        const item = {
          postId: p._id,
          title: p.title || '无标题',
          excerpt: p.content ? p.content.substring(0, 60) : '',
          category: p.category || '',
          likeCount: p.likeCount || 0,
          commentCount: p.commentCount || 0,
          timeText: relativeTime(p.create_time),
          isAnon: !!p.is_anonymous
        }
        if (p.is_anonymous) treeHolePosts.push(item)
        else posts.push(item)
      })
      this.setData({ posts, treeHolePosts })
    } catch (err) {
      console.error('[mine] 加载我的帖子失败：', err)
      this.setData({ posts: [], treeHolePosts: [] })
    }
  },

  // ==================== 我赞过的帖子（likes 直读 + posts 联查） ====================
  async _loadLikedPosts() {
    try {
      const likeRes = await db.collection('likes')
        .orderBy('create_time', 'desc')
        .limit(50)
        .get()
      const postIds = likeRes.data.map(l => l.postId).filter(Boolean)
      if (postIds.length === 0) {
        this.setData({ likedPosts: [] })
        return
      }
      const postsRes = await db.collection('posts')
        .where({ _id: _.in(postIds) })
        .get()
      const postMap = {}
      postsRes.data.forEach(p => { postMap[p._id] = p })

      const likedPosts = likeRes.data
        .filter(l => postMap[l.postId] && postMap[l.postId].status !== -1)
        .map(l => {
          const post = postMap[l.postId]
          return {
            postId: l.postId,
            title: post.title || '无标题',
            excerpt: post.content ? post.content.substring(0, 60) : '',
            category: post.category || '',
            authorName: post.authorName || '宝妈用户',
            authorAvatar: post.authorAvatar || '',
            likeCount: post.likeCount || 0,
            commentCount: post.commentCount || 0,
            timeText: relativeTime(l.create_time),
            isAnon: !!post.is_anonymous
          }
        })
      this.setData({ likedPosts })
    } catch (err) {
      console.error('[mine] 加载点赞列表失败：', err)
      this.setData({ likedPosts: [] })
    }
  },

  // ==================== 我收藏的帖子（favorites 直读 + posts 联查） ====================
  async _loadFavoritePosts() {
    try {
      const favRes = await db.collection('favorites')
        .orderBy('create_time', 'desc')
        .limit(50)
        .get()
      const postIds = favRes.data.map(f => f.postId).filter(Boolean)
      if (postIds.length === 0) {
        this.setData({ favoritePosts: [] })
        return
      }
      const postsRes = await db.collection('posts')
        .where({ _id: _.in(postIds) })
        .get()
      const postMap = {}
      postsRes.data.forEach(p => { postMap[p._id] = p })

      const favoritePosts = favRes.data
        .filter(f => postMap[f.postId] && postMap[f.postId].status !== -1)
        .map(f => {
          const post = postMap[f.postId]
          return {
            postId: f.postId,
            title: post.title || '无标题',
            excerpt: post.content ? post.content.substring(0, 60) : '',
            category: post.category || '',
            authorName: post.authorName || '宝妈用户',
            authorAvatar: post.authorAvatar || '',
            likeCount: post.likeCount || 0,
            commentCount: post.commentCount || 0,
            timeText: relativeTime(f.create_time),
            isAnon: !!post.is_anonymous
          }
        })
      this.setData({ favoritePosts })
    } catch (err) {
      console.error('[mine] 加载收藏列表失败：', err)
      this.setData({ favoritePosts: [] })
    }
  },

  // ==================== Tab 切换（点击 + 左右滑动） ====================
  onTabTap(e) {
    const i = e.currentTarget.dataset.index
    this.setData({ currentTab: i })
  },

  // 根容器左右滑动切换 Tab
  onTouchStart(e) {
    this._touchX = e.touches[0].clientX
    this._touchY = e.touches[0].clientY
  },

  onTouchEnd(e) {
    if (this._touchX === undefined) return
    const dx = e.changedTouches[0].clientX - this._touchX
    const dy = e.changedTouches[0].clientY - this._touchY
    if (Math.abs(dy) > Math.abs(dx) || Math.abs(dx) < 50) {
      this._touchX = undefined
      return
    }
    const max = this.data.tabs.length - 1
    if (dx < 0 && this.data.currentTab < max) {
      this.setData({ currentTab: this.data.currentTab + 1 })
    } else if (dx > 0 && this.data.currentTab > 0) {
      this.setData({ currentTab: this.data.currentTab - 1 })
    }
    this._touchX = undefined
  },

  // ==================== 跳转 ====================
  onPostTap(e) {
    const postId = e.currentTarget.dataset.postId
    if (!postId) return
    wx.navigateTo({ url: `/subpkg/post-detail/post-detail?id=${postId}` })
  },

  onEditProfile() {
    if (!auth.isLogin()) {
      const modal = this.selectComponent('#loginModal')
      if (modal) modal.show()
      return
    }
    wx.navigateTo({ url: '/subpkg/edit-profile/edit-profile' })
  },

  onSettings() {
    wx.navigateTo({ url: '/subpkg/settings/settings' })
  },

  onAdminTap() {
    if (!this.data.isAdmin) {
      showError('需要管理员权限')
      return
    }
    wx.navigateTo({ url: '/subpkg/admin/admin' })
  },

  // 未登录点击 → 登录弹窗
  onLoginTap() {
    const modal = this.selectComponent('#loginModal')
    if (modal) modal.show()
  },

  // 登录成功回调：刷新个人信息与数据
  onLoginSuccess() {
    this.loadAll()
    showSuccess('登录成功')
  }
})
