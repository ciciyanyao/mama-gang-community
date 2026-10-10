// pages/jobs/jobs.js —— 招聘信息（F6 岗位卡片 + 城市筛选）
const { showError } = require('../../utils/util.js')

// ==================== 演示数据（P2 可选功能，使用静态数据） ====================
const DEMO_JOBS = [
  {
    _id: 'job_001',
    title: '客服专员',
    company: '阳光家政服务有限公司',
    salary: '4000-6000元/月',
    city: '广州',
    district: '天河区',
    workHours: '9:00-17:00（可弹性）',
    jobType: '全职',
    tags: ['五险一金', '周末双休', '弹性工作'],
    description: '负责客户咨询接待，处理客户投诉和建议。要求普通话标准，有耐心，善于沟通。'
  },
  {
    _id: 'job_002',
    title: '电商客服',
    company: '优品电子商务',
    salary: '3500-5000元/月',
    city: '深圳',
    district: '南山区',
    workHours: '8:30-17:30',
    jobType: '全职',
    tags: ['五险', '包午餐', '妈妈岗'],
    description: '在线回复客户咨询，处理订单问题。打字速度要求60字/分钟以上。'
  },
  {
    _id: 'job_003',
    title: '社区团购团长',
    company: '邻里优选',
    salary: '3000-8000元/月',
    city: '广州',
    district: '番禺区',
    workHours: '时间自由',
    jobType: '兼职',
    tags: ['居家办公', '时间自由', '高提成'],
    description: '负责社区团购群运营，商品推广和订单管理。宝妈优先，可在家工作。'
  },
  {
    _id: 'job_004',
    title: '幼师助理',
    company: '阳光幼儿园',
    salary: '3500-4500元/月',
    city: '佛山',
    district: '南海区',
    workHours: '8:00-17:00',
    jobType: '全职',
    tags: ['周末双休', '寒暑假', '有社保'],
    description: '协助主班老师开展教学活动，照顾幼儿日常生活。有幼教经验优先。'
  },
  {
    _id: 'job_005',
    title: '数据录入员',
    company: '恒信数据科技',
    salary: '3000-4000元/月',
    city: '东莞',
    district: '东城区',
    workHours: '9:00-18:00',
    jobType: '全职',
    tags: ['五险一金', '周末双休', '坐班'],
    description: '负责数据录入和整理工作，要求细心认真，熟悉办公软件操作。'
  },
  {
    _id: 'job_006',
    title: '手工外发',
    company: '创意手工坊',
    salary: '计件工资',
    city: '广州',
    district: '白云区',
    workHours: '在家完成',
    jobType: '兼职',
    tags: ['居家办公', '计件', '手工活'],
    description: '手工饰品组装，可带回家做，按件计费，多劳多得。免费培训。'
  },
  {
    _id: 'job_007',
    title: '超市收银员',
    company: '惠民超市',
    salary: '3500-4500元/月',
    city: '深圳',
    district: '宝安区',
    workHours: '两班倒',
    jobType: '全职',
    tags: ['五险', '包食宿', '带薪年假'],
    description: '负责超市收银工作，要求诚实守信，服务态度好。有收银经验优先。'
  },
  {
    _id: 'job_008',
    title: '文案编辑',
    company: '新媒体工作室',
    salary: '4000-7000元/月',
    city: '广州',
    district: '海珠区',
    workHours: '弹性工作',
    jobType: '兼职',
    tags: ['居家办公', '弹性', '新媒体'],
    description: '负责公众号、小红书等平台的内容创作。要求文笔好，有创意。可远程。'
  }
]

// 城市筛选列表
const CITY_LIST = ['全部', '广州', '深圳', '佛山', '东莞']

const PAGE_SIZE = 10

Page({
  data: {
    // 城市筛选
    cities: CITY_LIST,
    activeCity: 0,
    // 职位列表
    jobList: [],
    filteredJobs: [],
    displayJobs: [],
    page: 0,
    noMore: false,
    loading: false,
    isEmpty: false
  },

  onLoad() {
    // 加载演示数据
    this.setData({ jobList: DEMO_JOBS })
    this._filterAndPage(true)
  },

  // ==================== 城市筛选 ====================
  onCityTap(e) {
    const index = e.currentTarget.dataset.index
    if (index === this.data.activeCity) return

    this.setData({ activeCity: index })
    this._filterAndPage(true)
  },

  // ==================== 筛选 + 分页 ====================
  _filterAndPage(reset) {
    const { jobList, activeCity, cities } = this.data
    const city = cities[activeCity]

    // 筛选
    const filtered = city === '全部'
      ? jobList
      : jobList.filter(j => j.city === city)

    if (reset) {
      const displayJobs = filtered.slice(0, PAGE_SIZE)
      this.setData({
        filteredJobs: filtered,
        displayJobs,
        page: 1,
        noMore: displayJobs.length >= filtered.length,
        isEmpty: displayJobs.length === 0
      })
    } else {
      const page = this.data.page
      const newJobs = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
      const displayJobs = [...this.data.displayJobs, ...newJobs]
      this.setData({
        displayJobs,
        page: page + 1,
        noMore: displayJobs.length >= filtered.length
      })
    }
  },

  // ==================== 点击职位卡片 ====================
  onJobTap(e) {
    const jobId = e.currentTarget.dataset.id
    const job = this.data.jobList.find(j => j._id === jobId)
    if (!job) return

    // 展示职位详情弹窗
    wx.showModal({
      title: job.title,
      content: `公司：${job.company}\n薪资：${job.salary}\n地点：${job.city} ${job.district}\n工时：${job.workHours}\n类型：${job.jobType}\n\n${job.description}`,
      showCancel: false,
      confirmText: '知道了'
    })
  },

  // ==================== 上拉触底 ====================
  onReachBottom() {
    if (!this.data.noMore) {
      this._filterAndPage(false)
    }
  },

  // ==================== 下拉刷新 ====================
  onPullDownRefresh() {
    this._filterAndPage(true)
    wx.stopPullDownRefresh()
  }
})