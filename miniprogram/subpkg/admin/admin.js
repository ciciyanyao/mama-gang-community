// pages/admin/admin.js —— 管理后台（F5 管理员专用）
const db = wx.cloud.database()
const _ = db.command
const { relativeTime, confirm, showError, showSuccess } = require('../../utils/util.js')

const PAGE_SIZE = 20

Page({
  data: {
    // 当前 tab
    currentTab: 'stats', // 'stats' | 'reports'
    // 统计数据
    stats: {
      todayPosts: 0,
      todayComments: 0,
      pendingReports: 0,
      totalUsers: 0
    },
    // 举报列表
    reports: [],
    reportPage: 0,
    reportNoMore: false,
    reportLoading: false,
    // 通用
    loading: false,
    // 权限校验
    hasPermission: false
  },

  async onLoad() {
    await this._checkPermission()
  },

  onShow() {
    if (this.data.hasPermission) {
      this.loadStats()
    }
  },

  // ==================== 权限校验 ====================
  async _checkPermission() {
    try {
      const loginRes = await wx.cloud.callFunction({ name: 'login' })
      const openid = loginRes.result.openid

      const userRes = await db.collection('users')
        .where({ _openid: openid })
        .limit(1)
        .get()

      if (userRes.data.length > 0 && userRes.data[0].role === 2) {
        this.setData({ hasPermission: true })
        this.loadStats()
        this.loadReports(true)
      } else {
        wx.showModal({
          title: '权限不足',
          content: '需要管理员权限才能访问此页面',
          showCancel: false,
          success() {
            wx.navigateBack()
          }
        })
      }
    } catch (err) {
      console.error('[admin] 权限校验失败：', err)
      showError('权限校验失败')
    }
  },

  // ==================== 加载统计数据 ====================
  async loadStats() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'admin',
        data: { action: 'getAdminStats' }
      })

      if (res.result.code === 0) {
        this.setData({ stats: res.result.data })
      }
    } catch (err) {
      console.error('[loadStats] 失败：', err)
    }
  },

  // ==================== 加载举报列表 ====================
  async loadReports(reset) {
    if (this.data.reportLoading) return

    const page = reset ? 0 : this.data.reportPage
    this.setData({ reportLoading: true })

    try {
      const res = await wx.cloud.callFunction({
        name: 'admin',
        data: {
          action: 'getReportList',
          page: page + 1,
          pageSize: PAGE_SIZE,
          status: 1 // 只加载待处理的
        }
      })

      if (res.result.code === 0) {
        const raw = res.result.data.list || res.result.data
        const newReports = (Array.isArray(raw) ? raw : []).map(report => ({
          ...report,
          timeText: relativeTime(report.create_time),
          typeLabel: report.targetType === 'post' ? '帖子' : '评论'
        }))

        const reports = reset ? newReports : [...this.data.reports, ...newReports]

        this.setData({
          reports,
          reportPage: page + 1,
          reportNoMore: newReports.length < PAGE_SIZE,
          reportLoading: false
        })
      }
    } catch (err) {
      console.error('[loadReports] 失败：', err)
      showError('加载举报失败')
      this.setData({ reportLoading: false })
    }
  },

  // ==================== Tab 切换 ====================
  onTabChange(e) {
    const tab = e.currentTarget.dataset.tab
    if (tab === this.data.currentTab) return

    this.setData({ currentTab: tab })

    if (tab === 'reports' && this.data.reports.length === 0) {
      this.loadReports(true)
    }
  },

  // ==================== 处理举报（批准/驳回） ====================
  async onHandleReport(e) {
    const { reportId, action } = e.currentTarget.dataset
    const isApprove = action === 'approve'

    const confirmed = await confirm(
      '确认处理',
      isApprove ? '确定要批准举报并删除内容吗？' : '确定要驳回这条举报吗？'
    )
    if (!confirmed) return

    try {
      const res = await wx.cloud.callFunction({
        name: 'admin',
        data: {
          action: 'handleReport',
          reportId,
          handleAction: action
        }
      })

      if (res.result.code === 0) {
        showSuccess(isApprove ? '已批准' : '已驳回')
        // 刷新列表和统计
        this.setData({ reports: [], reportPage: 0, reportNoMore: false })
        this.loadReports(true)
        this.loadStats()
      } else {
        showError(res.result.message || '操作失败')
      }
    } catch (err) {
      console.error('[onHandleReport] 失败：', err)
      showError('处理失败')
    }
  },

  // ==================== 删除帖子 ====================
  async onDeletePost(e) {
    const postId = e.currentTarget.dataset.postId

    const confirmed = await confirm('确认删除', '确定要删除这个帖子吗？删除后无法恢复。')
    if (!confirmed) return

    try {
      const res = await wx.cloud.callFunction({
        name: 'admin',
        data: {
          action: 'deletePost',
          postId,
          reason: '管理员删除'
        }
      })

      if (res.result.code === 0) {
        showSuccess('已删除')
        this.loadStats()
      } else {
        showError(res.result.message || '删除失败')
      }
    } catch (err) {
      console.error('[onDeletePost] 失败：', err)
      showError('删除失败')
    }
  },

  // ==================== 下拉刷新 ====================
  onPullDownRefresh() {
    this.loadStats()
    if (this.data.currentTab === 'reports') {
      this.setData({ reports: [], reportPage: 0, reportNoMore: false })
      this.loadReports(true).then(() => wx.stopPullDownRefresh())
    } else {
      wx.stopPullDownRefresh()
    }
  },

  // ==================== 上拉触底 ====================
  onReachBottom() {
    if (this.data.currentTab === 'reports' && !this.data.reportNoMore && !this.data.reportLoading) {
      this.loadReports(false)
    }
  }
})