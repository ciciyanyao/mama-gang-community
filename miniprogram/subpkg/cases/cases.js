// pages/cases/cases.js
Page({
  data: {
    keyword: '',
    types: ['全部', '劳动争议', '生育津贴', '工时纠纷'],
    currentType: '全部',
    allCases: [
      { _id: '1', title: '产假期间被辞退，法院判赔双倍工资', city: '广州', type: '劳动争议', summary: '李某产假期间被公司以旷工为由辞退，法院认定违法解除，判赔双倍赔偿金。' },
      { _id: '2', title: '生育津贴申领被拒，法院判决社保局重新核定', city: '深圳', type: '生育津贴', summary: '公司未足额缴纳生育保险，导致津贴标准降低，法院判决补足差额。' },
      { _id: '3', title: '妈妈岗加班费争议，法院调解结案', city: '东莞', type: '工时纠纷', summary: '弹性工作制下加班费认定标准争议，最终调解结案，双方满意。' }
    ],
    displayList: []
  },

  onLoad() {
    const bgList = [
      '/subpkg/case-detail/paper/bg1.jpg',
      '/subpkg/case-detail/paper/bg2.jpg',
      '/subpkg/case-detail/paper/bg3.jpg',
      '/subpkg/case-detail/paper/bg4.jpg',
      '/subpkg/case-detail/paper/bg5.jpg'
    ];
    const allCasesWithBg = this.data.allCases.map(item => ({
      ...item,
      bgImage: bgList[Math.floor(Math.random() * bgList.length)]
    }));
    
    this.setData({ allCases: allCasesWithBg });
    this.filterData();
  },

  onSearchInput(e) {
    this.setData({ keyword: e.detail.value });
    this.filterData();
  },

  switchType(e) {
    this.setData({ currentType: e.currentTarget.dataset.type });
    this.filterData();
  },

  filterData() {
    const { keyword, currentType, allCases } = this.data;
    const filtered = allCases.filter(item => {
      const matchType = currentType === '全部' || item.type === currentType;
      const lowerKeyword = keyword.toLowerCase();
      const matchKeyword = !keyword || 
        item.title.toLowerCase().includes(lowerKeyword) ||
        item.city.toLowerCase().includes(lowerKeyword) ||
        item.type.toLowerCase().includes(lowerKeyword) ||
        item.summary.toLowerCase().includes(lowerKeyword);
      return matchType && matchKeyword;
    });
    this.setData({ displayList: filtered });
  },

  // 🚨 点击跳转逻辑
  goToDetail(e) {
    const id = e.currentTarget.dataset.id;
    console.log('点击了案例，准备跳转，id =', id); // 🚨 调试用，看控制台有没有打印
    wx.navigateTo({
      url: '/subpkg/case-detail/case-detail?id=' + id
    });
  }
});