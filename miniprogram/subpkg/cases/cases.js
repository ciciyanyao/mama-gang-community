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
    loading: true
  },

  onLoad() {
    this.bgList = [
      '/subpkg/case-detail/paper/bg1.jpg',
      '/subpkg/case-detail/paper/bg2.jpg',
      '/subpkg/case-detail/paper/bg3.jpg',
      '/subpkg/case-detail/paper/bg4.jpg',
      '/subpkg/case-detail/paper/bg5.jpg'
    ]
    this.loadCases()
  },

  // 从云函数拉全量（前端 get 单次最多 20 条，改用云函数端管理员读取，一次拿完 371 条）
  async loadCases() {
    try {
      const res = await wx.cloud.callFunction({ name: 'getCases' })
      const all = (res.result && res.result.list) || []
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
      this.filterData()
    } catch (e) {
      console.error('读取案例库失败：', e)
      this.setData({ loading: false })
      wx.showToast({
        title: '读取案例库失败，请检查 cases 集合权限是否设为"所有用户可读"',
        icon: 'none',
        duration: 3000
      })
    }
  },

  onSearchInput(e) {
    this.setData({ keyword: e.detail.value })
    this.filterData()
  },

  switchCity(e) {
    this.setData({ currentCity: e.currentTarget.dataset.name })
    this.filterData()
  },

  switchType(e) {
    this.setData({ currentType: e.currentTarget.dataset.name })
    this.filterData()
  },

  filterData() {
    const { keyword, currentCity, currentType, allCases } = this.data
    const lowerKeyword = (keyword || '').toLowerCase()
    const filtered = allCases.filter(item => {
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
    // 命中字段生成高亮片段
    const displayList = filtered.map(item => ({
      ...item,
      titleHL: splitHighlight(item.title, keyword),
      cityHL: splitHighlight(item.city, keyword),
      typeHL: splitHighlight(item.type, keyword),
      summaryHL: splitHighlight(item.summary, keyword)
    }))
    this.setData({ displayList: displayList })
  },

  // 点击跳转详情：传 _id
  goToDetail(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: '/subpkg/case-detail/case-detail?id=' + id
    })
  }
})
