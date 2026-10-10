// pages/cases/cases.js
Page({
  data: {
    keyword: '',
    types: ['全部', '劳动争议', '生育津贴', '工时纠纷'],
    currentType: '全部',
    caseList: [
      { _id: '1', title: '产假期间被辞退，法院判赔双倍工资', city: '广州', type: '劳动争议', summary: '李某产假期间被公司以旷工为由辞退，法院认定违法解除，判赔双倍赔偿金。' },
      { _id: '2', title: '生育津贴申领被拒，法院判决社保局重新核定', city: '深圳', type: '生育津贴', summary: '公司未足额缴纳生育保险，导致津贴标准降低，法院判决补足差额。' },
      { _id: '3', title: '妈妈岗加班费争议，法院调解结案', city: '东莞', type: '工时纠纷', summary: '弹性工作制下加班费认定标准争议，最终调解结案，双方满意。' }
    ]
  },

  onSearchInput(e) { this.setData({ keyword: e.detail.value }); },
  switchType(e) { this.setData({ currentType: e.currentTarget.dataset.type }); },

  goToDetail(e) {
    const id = e.currentTarget.dataset.id;
    // 跳转到详情页，并把 id 当做参数带上
    wx.navigateTo({
      url: `/pages/cases/case-detail?id=${id}`
    });
  }
});
