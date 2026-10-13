// pages/case-detail/case-detail.js —— 案例详情页（云数据库真实数据）
// 从 cases 集合按 _id 读取单条；字段映射：outcome→result、source→court+案号

function makeTitle(summary) {
  if (!summary) return '未命名案例'
  const m = summary.match(/^([^。；;]{2,20})/)
  return m ? m[1] : summary.slice(0, 16)
}

Page({
  data: {
    bgImage: '',
    caseInfo: {}
  },

  onLoad(options) {
    // 随机背景图（队友 paper 系列）
    const bgList = [
      '/subpkg/case-detail/paper/bg1.jpg',
      '/subpkg/case-detail/paper/bg2.jpg',
      '/subpkg/case-detail/paper/bg3.jpg',
      '/subpkg/case-detail/paper/bg4.jpg',
      '/subpkg/case-detail/paper/bg5.jpg'
    ]
    const randomBg = bgList[Math.floor(Math.random() * bgList.length)]
    this.setData({ bgImage: randomBg })

    if (options.id) {
      this.loadCase(options.id)
    } else {
      this.setData({
        caseInfo: { title: '缺少案例 ID', city: '', type: '', summary: '请返回列表页重新进入。', outcome: '', source: '' }
      })
    }
  },

  async loadCase(id) {
    try {
      const res = await wx.cloud.database().collection('cases').doc(id).get()
      const c = res.data || {}
      this.setData({
        caseInfo: {
          title: makeTitle(c.summary),
          city: c.city || '',
          type: (c.tags && c.tags[0]) || '劳动争议',
          summary: c.summary || '',
          outcome: c.result || '（裁判结果暂缺）',
          source: [c.court, c.case_no].filter(Boolean).join(' · ') || '来源暂缺'
        }
      })
    } catch (e) {
      console.error('读取案例详情失败：', e)
      wx.showToast({ title: '未找到该案例', icon: 'none' })
      this.setData({
        caseInfo: { title: '案例不存在或已删除', city: '', type: '', summary: '请返回列表页重试。', outcome: '', source: '' }
      })
    }
  },

  goBack() {
    const pages = getCurrentPages()
    if (pages.length > 1) {
      wx.navigateBack()
    } else {
      wx.reLaunch({ url: '/subpkg/cases/cases' })
    }
  },

  onLoginSuccess() {}
})
