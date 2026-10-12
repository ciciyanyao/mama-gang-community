// pages/my-favorites/my-favorites.js —— 我的收藏（F4）
const db = wx.cloud.database()
const _ = db.command
const { relativeTime, confirm, showError, showSuccess } = require('../../utils/util.js')

const PAGE_SIZE = 20

Page({
  data: {
    favoriteList: [],
    page: 0,
    noMore: false,
    loading: false,
    isEmpty: false
  },

  onLoad() {
    this.loadFavorites(true)
  },

  // ==================== 加载收藏列表 ====================
  async loadFavorites(reset) {
    if (this.data.loading) return

    const page = reset ? 0 : this.data.page
    this.setData({ loading: true })

    try {
      const skip = page * PAGE_SIZE

      // 1. 获取收藏记录
      const favRes = await db.collection('favorites')
        .orderBy('create_time', 'desc')
        .skip(skip)
        .limit(PAGE_SIZE)
        .get()

      if (favRes.data.length === 0) {
        this.setData({
          favoriteList: reset ? [] : this.data.favoriteList,
          isEmpty: reset,
          noMore: true,
          loading: false
        })
        return
      }

      // 2. 批量获取帖子信息
      const postIds = favRes.data.map(f => f.postId).filter(Boolean)
      const postsRes = await db.collection('posts')
        .where({ _id: _.in(postIds) })
        .get()

      const postMap = {}
      postsRes.data.forEach(p => { postMap[p._id] = p })

      // 3. 组装数据
      const newItems = favRes.data
        .filter(fav => postMap[fav.postId]) // 过滤已删除帖子
        .map(fav => {
          const post = postMap[fav.postId]
          return {
            favoriteId: fav._id,
            postId: fav.postId,
            postTitle: post.title || '无标题',
            postContent: post.content ? post.content.substring(0, 60) : '',
            postCategory: post.category || '',
            likeCount: post.likeCount || 0,
            commentCount: post.commentCount || 0,
            favoriteTimeText: relativeTime(fav.create_time)
          }
        })

      const favoriteList = reset ? newItems : [...this.data.favoriteList, ...newItems]

      this.setData({
        favoriteList,
        page: page + 1,
        noMore: newItems.length < PAGE_SIZE,
        isEmpty: favoriteList.length === 0,
        loading: false
      })
    } catch (err) {
      console.error('[loadFavorites] 失败：', err)
      showError('加载失败')
      this.setData({ loading: false })
    }
  },

  // ==================== 下拉刷新 ====================
  onPullDownRefresh() {
    this.loadFavorites(true).then(() => {
      wx.stopPullDownRefresh()
    })
  },

  // ==================== 上拉触底加载更多 ====================
  onReachBottom() {
    if (!this.data.noMore && !this.data.loading) {
      this.loadFavorites(false)
    }
  },

  // ==================== 点击帖子 → 详情 ====================
  onPostTap(e) {
    const postId = e.currentTarget.dataset.postId
    if (!postId) return
    wx.navigateTo({ url: `/subpkg/post-detail/post-detail?id=${postId}` })
  },

  // ==================== 取消收藏 ====================
  async onRemoveFavorite(e) {
    const { favoriteId, postId } = e.currentTarget.dataset

    const confirmed = await confirm('提示', '确定要取消收藏吗？')
    if (!confirmed) return

    try {
      // 从云数据库删除
      await db.collection('favorites').doc(favoriteId).remove()

      // 从列表移除
      const favoriteList = this.data.favoriteList.filter(f => f.favoriteId !== favoriteId)
      this.setData({
        favoriteList,
        isEmpty: favoriteList.length === 0
      })

      showSuccess('已取消收藏')
    } catch (err) {
      console.error('[onRemoveFavorite] 失败：', err)
      showError('操作失败')
    }
  }
})