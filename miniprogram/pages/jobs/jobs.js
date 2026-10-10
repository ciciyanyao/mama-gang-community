// pages/jobs/jobs.js —— 招聘信息（F6）
const { relativeTime, showError } = require('../../utils/util.js')

Page({
  data: {
    jobs: [],
    page: 1,
    pageSize: 20,
    hasMore: true,
    loading: false,
    currentCity: '全部',
    cities: ['全部', '广州', '深圳', '佛山', '东莞', '中山', '惠州', '珠海', '清远'],
    jobTypes: ['全部', '全职', '弹性', '计件'],
    currentType: '全部'
  },

  onLoad() {
    this.loadJobs(true)
  },

  // 加载招聘信息
  async loadJobs(reset) {
    if (this.data.loading) return

    const page = reset ? 1 : this.data.page
    this.setData({ loading: true })

    try {
      const res = await wx.cloud.callFunction({
        name: 'job',
        data: {
          action: 'list',
          page,
          pageSize: this.data.pageSize,
          city: this.data.currentCity === '全部' ? '' : this.data.currentCity,
          type: this.data.currentType === '全部' ? '' : this.data.currentType
        }
      })

      if (res.result.code === 0) {
        const newJobs = (res.result.data || []).map(job => ({
          ...job,
          _timeText: relativeTime(job.create_time)
        }))
        this.setData({
          jobs: reset ? newJobs : [...this.data.jobs, ...newJobs],
          hasMore: newJobs.length === this.data.pageSize,
          page: page + 1
        })
      }
    } catch (err) {
      console.error('获取招聘信息失败', err)
      showError('加载失败')
    } finally {
      this.setData({ loading: false })
    }
  },

  // 切换城市筛选
  onCityChange(e) {
    const city = e.currentTarget.dataset.city
    this.setData({ currentCity: city, jobs: [], page: 1, hasMore: true })
    this.loadJobs(true)
  },

  // 切换类型筛选
  onTypeChange(e) {
    const type = e.currentTarget.dataset.type
    this.setData({ currentType: type, jobs: [], page: 1, hasMore: true })
    this.loadJobs(true)
  },

  // 点击查看岗位详情
  onJobTap(e) {
    const jobId = e.currentTarget.dataset.jobId
    wx.navigateTo({
      url: `/pages/jobs/job-detail?id=${jobId}`
    })
  },

  // 下拉刷新
  onPullDownRefresh() {
    this.setData({ jobs: [], page: 1, hasMore: true })
    this.loadJobs(true).then(() => wx.stopPullDownRefresh())
  },

  // 上拉加载更多
  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadJobs(false)
    }
  }
})