// pages/cases/cases.js —— 案例库列表页（云数据库真实数据）
// 数据源：cases 集合（371 条真实仲裁/诉讼案例，summary/focus/result 均已脱敏）

// 从 summary 开头按分句截取一段作标题（真实数据没有 title 字段）
function makeTitle(summary) {
  if (!summary) return '未命名案例'
  const m = summary.match(/^([^。；;]{2,20})/)
  return m ? m[1] : summary.slice(0, 16)
}

// 搜索关键词高亮：把文本拆成 [普通段, 命中段, ...] 片段数组
function splitHighlight(text, keyword) {
  const str = text || ''
  if (!keyword) return [{ text: str, hl: false }]
  const lower = str.toLowerCase()
  const kw = keyword.toLowerCase()
  const out = []
  let i = 0
  let idx = lower.indexOf(kw, i)
  while (idx !== -1) {
    if (idx > i) out.push({ text: str.slice(i, idx), hl: false })
    out.push({ text: str.slice(idx, idx + kw.length), hl: true })
    i = idx + kw.length
    idx = lower.indexOf(kw, i)
  }
  if (i < str.length) out.push({ text: str.slice(i), hl: false })
  return out.length ? out : [{ text: str, hl: false }]
}

Page({
  data: {
    keyword: '',
    cityList: [{ name: '全部', count: null }],
    currentCity: '全部',
    types: [{ name: '全部', count: null }],
    currentType: '全部',
    allCases: [],
    displayList: [],
    loading: true,
    page: 1,
    pageSize: 20,
    hasMore: false,
    totalShown: 0,
    filterTotal: 0
  },

  onLoad() {
    this.bgList = [
      '/subpkg/case-detail/paper/bg1.jpg',
      '/subpkg/case-detail/paper/bg2.jpg',
      '/subpkg/case-detail/paper/bg3.jpg',
      '/subpkg/case-detail/paper/bg4.jpg',
      '/subpkg/case-detail/paper/bg5.jpg'
    ]
    this._filtered = [] // 全量筛选结果（非渲染数据），分页取片渲染
    this.loadCases()
  },

  // 从云函数拉全量（前端 get 单次最多 20 条，改用云函数端管理员读取，一次拿完）
  // 优化：结果缓存 30 分钟（wx.setStorage），二次进入秒开；渲染按页切片，避免 371 张卡片一次渲染卡死
  async loadCases() {
    const CACHE_KEY = 'cases_cache_v1'
    let cached = null
    try {
      cached = wx.getStorageSync(CACHE_KEY)
      if (cached && cached.time && Date.now() - cached.time < 30 * 60 * 1000 && cached.data) {
        cached = cached.data
      } else {
        cached = null
      }
    } catch (e) { cached = null }

    let all = cached
    if (!all) {
      try {
        const res = await wx.cloud.callFunction({ name: 'getCases' })
        all = (res.result && res.result.list) || []
        if (all.length) {
          try {
            wx.setStorageSync(CACHE_KEY, { time: Date.now(), data: all })
          } catch (e) {}
        }
      } catch (e) {
        console.error('读取案例库失败：', e)
        this.setData({ loading: false })
        wx.showToast({
          title: '读取案例库失败，请检查 cases 集合权限是否设为"所有用户可读"',
          icon: 'none',
          duration: 3000
        })
        return
      }
    }

    if (!all.length) {
      this.setData({ loading: false })
      wx.showToast({ title: '案例库暂无数据', icon: 'none' })
      return
    }
    // 字段适配：生成 title / type，其余真实字段原样保留
    const mapped = all.map((item, i) => ({
      _id: item._id,
      title: makeTitle(item.summary),
      city: item.city || '',
      type: (item.tags && item.tags[0]) || '劳动争议',
      summary: item.summary || '',
      case_no: item.case_no || '',
      court: item.court || '',
      judge_date: item.judge_date || '',
      focus: item.focus || '',
      result: item.result || '',
      tags: item.tags || [],
      bgImage: this.bgList[i % this.bgList.length]
    }))

    // 城市筛选列表（带计数，按数量降序）
    const cityMap = {}
    mapped.forEach(c => { if (c.city) cityMap[c.city] = (cityMap[c.city] || 0) + 1 })
    const cityList = [{ name: '全部', count: null }].concat(
      Object.entries(cityMap).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name: name, count: count }))
    )

    // 类型筛选列表（从 tags 动态提取，带计数，按数量降序）
    const tagMap = {}
    mapped.forEach(c => (c.tags || []).forEach(t => { tagMap[t] = (tagMap[t] || 0) + 1 }))
    const types = [{ name: '全部', count: null }].concat(
      Object.entries(tagMap).sort((a, b) => b[1] - a[1]).slice(0, 11).map(([name, count]) => ({ name: name, count: count }))
    )

    this.setData({ allCases: mapped, cityList: cityList, types: types, loading: false })
    this.filterData(true)
  },

  onSearchInput(e) {
    this.setData({ keyword: e.detail.value })
    this.filterData(true)
  },

  switchCity(e) {
    this.setData({ currentCity: e.currentTarget.dataset.name })
    this.filterData(true)
  },

  switchType(e) {
    this.setData({ currentType: e.currentTarget.dataset.name })
    this.filterData(true)
  },

  // 触底加载下一页（渲染分页，避免一次渲染几百条）
  onReachBottom() {
    if (!this.data.hasMore) return
    const nextPage = this.data.page + 1
    this.setData({ page: nextPage })
    this._renderPage()
  },

  filterData(resetPage) {
    const { keyword, currentCity, currentType, allCases } = this.data
    const lowerKeyword = (keyword || '').toLowerCase()
    this._filtered = allCases.filter(item => {
      const matchCity = currentCity === '全部' || item.city === currentCity
      const matchType = currentType === '全部' || item.type === currentType
      const matchKeyword = !lowerKeyword ||
        item.title.toLowerCase().includes(lowerKeyword) ||
        item.city.toLowerCase().includes(lowerKeyword) ||
        item.type.toLowerCase().includes(lowerKeyword) ||
        item.summary.toLowerCase().includes(lowerKeyword) ||
        (item.case_no || '').toLowerCase().includes(lowerKeyword) ||
        (item.court || '').toLowerCase().includes(lowerKeyword) ||
        (item.focus || '').toLowerCase().includes(lowerKeyword) ||
        (item.result || '').toLowerCase().includes(lowerKeyword)
      return matchCity && matchType && matchKeyword
    })
    if (resetPage) this.setData({ page: 1 })
    this._renderPage()
  },

  // 只对当前页数据做高亮拆分并渲染（高亮是字符串遍历，全量 371 条每次重算很卡）
  _renderPage() {
    const { page, pageSize } = this.data
    const { keyword } = this.data
    const start = 0
    const end = page * pageSize
    const shown = this._filtered.slice(start, end)
    const hasMore = this._filtered.length > end
    const displayList = shown.map(item => ({
      ...item,
      titleHL: splitHighlight(item.title, keyword),
      cityHL: splitHighlight(item.city, keyword),
      typeHL: splitHighlight(item.type, keyword),
      summaryHL: splitHighlight(item.summary, keyword)
    }))
    this.setData({
      displayList,
      hasMore,
      totalShown: shown.length,
      filterTotal: this._filtered.length,
      'loading': false
    })
  },

  // 点击跳转详情：传 _id
  goToDetail(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: '/subpkg/case-detail/case-detail?id=' + id
    })
  }
})
