// pages/my-posts/my-posts.js —— 我的帖子（子页面 of 我的）
const { relativeTime, showError } = require('../../utils/util.js')

const PAGE_SIZE = 20

Page({
  data: {
    postList: [],
    page: 0,
    noMore: false,
    loading: false,
    isEmpty: false
  },

  onLoad() {
    this.loadPosts(true)
  },

  // ==================== 加载我的帖子 ====================
  async loadPosts(reset) {
    if (this.data.loading) return

    const page = reset ? 0 : this.data.page
    this.setData({ loading: true })

    try {
      const res = await wx.cloud.callFunction({
        name: 'post',
        data: {
          action: 'myPosts',
          page: page + 1,
          pageSize: PAGE_SIZE
        }
      })

      if (res.result.code === 0) {
        const raw = res.result.data.list || res.result.data
        const newPosts = raw.map(post => ({
          ...post,
          timeText: relativeTime(post.create_time),
          contentPreview: post.content ? post.content.substring(0, 80) : ''
        }))

        const postList = reset ? newPosts : [...this.data.postList, ...newPosts]

        this.setData({
          postList,
          page: page + 1,
          noMore: res.result.data.hasMore === false || newPosts.length < PAGE_SIZE,
          isEmpty: postList.length === 0
        })
      }
    } catch (err) {
      console.error('[loadPosts] 失败：', err)
      showError('加载失败')
    } finally {
      this.setData({ loading: false })
    }
  },

  // ==================== 下拉刷新 ====================
  onPullDownRefresh() {
    this.loadPosts(true).then(() => {
      wx.stopPullDownRefresh()
    })
  },

  // ==================== 上拉触底加载更多 ====================
  onReachBottom() {
    if (!this.data.noMore && !this.data.loading) {
      this.loadPosts(false)
    }
  },

  // ==================== 点击帖子 → 详情 ====================
  onPostTap(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    wx.navigateTo({ url: `/pages/post-detail/post-detail?id=${id}` })
  },

  // ==================== 点击删除按钮 ====================
  onDeleteTap(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return

    wx.showModal({
      title: '提示',
      content: '确定要删除这条帖子吗？',
      confirmText: '删除',
      confirmColor: '#e74c3c',
      success: (res) => {
        if (res.confirm) {
          this.deletePost(id)
        }
      }
    })
  },

  // ==================== 删除帖子 ====================
  async deletePost(postId) {
    wx.showLoading({ title: '删除中...', mask: true })

    try {
      const res = await wx.cloud.callFunction({
        name: 'post',
        data: {
          action: 'delete',
          postId: postId
        }
      })

      wx.hideLoading()

      if (res.result.code === 0) {
        wx.showToast({ title: '删除成功', icon: 'success' })
        // 刷新列表
        this.loadPosts(true)
      } else {
        wx.showToast({ title: res.result.message || '删除失败', icon: 'none' })
      }
    } catch (err) {
      wx.hideLoading()
      console.error('[deletePost] 失败：', err)
      wx.showToast({ title: '删除失败', icon: 'none' })
    }
  }
})