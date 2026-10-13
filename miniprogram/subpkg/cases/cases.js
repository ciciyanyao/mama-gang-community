// pages/cases/cases.js —— 案例库列表页（云数据库真实数据）
// 数据源：cases 集合（371 条真实仲裁/诉讼案例，summary/focus/result 均已脱敏）

// 从 summary 开头按分句截取一段作标题（真实数据没有 title 字段）
function makeTitle(summary) {
  if (!summary) return '未命名案例'
  const m = summary.match(/^([^。；;]{2,20})/)
  return m ? m[1] : summary.slice(0, 16)
}

Page({
  data: {
    keyword: '',
    types: ['全部'],
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

  // 从云数据库分页拉全量（单次 get 上限 100 条，371 条需循环 4 次）
  async loadCases() {
    try {
      const coll = wx.cloud.database().collection('cases')
      const BATCH = 100
      let all = []
      for (let skip = 0; ; skip += BATCH) {
        const res = await coll.skip(skip).limit(BATCH).get()
        all = all.concat(res.data)
        if (res.data.length < BATCH) break
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
      // 类型筛选：从数据 tags 动态提取（数量上限 15，避免 chips 过长）
      const tagSet = new Set(['全部'])
      mapped.forEach(c => (c.tags || []).forEach(t => tagSet.add(t)))
      const types = Array.from(tagSet).slice(0, 15)
      this.setData({ allCases: mapped, types: types, loading: false })
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

  switchType(e) {
    this.setData({ currentType: e.currentTarget.dataset.type })
    this.filterData()
  },

  filterData() {
    const { keyword, currentType, allCases } = this.data
    const lowerKeyword = (keyword || '').toLowerCase()
    const filtered = allCases.filter(item => {
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
      return matchType && matchKeyword
    })
    this.setData({ displayList: filtered })
  },

  // 点击跳转详情：传 _id
  goToDetail(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: '/subpkg/case-detail/case-detail?id=' + id
    })
  }
})
