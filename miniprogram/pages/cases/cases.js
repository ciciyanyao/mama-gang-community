// pages/cases/cases.js
Page({
  data: {
    keyword: '',
    types: ['全部', '劳动争议', '生育津贴', '工时纠纷'],
    currentType: '全部',
    // 1. 原始数据池，用来做筛选的依据
    originalList: [
      { _id: '1', title: '产假期间被辞退，法院判赔双倍工资', city: '广州', type: '劳动争议', summary: '李某产假期间被公司以旷工为由辞退，法院认定违法解除，判赔双倍赔偿金。' },
      { _id: '2', title: '生育津贴申领被拒，法院判决社保局重新核定', city: '深圳', type: '生育津贴', summary: '公司未足额缴纳生育保险，导致津贴标准降低，法院判决补足差额。' },
      { _id: '3', title: '妈妈岗加班费争议，法院调解结案', city: '东莞', type: '工时纠纷', summary: '弹性工作制下加班费认定标准争议，最终调解结案，双方满意。' }
    ],
    // 2. 页面上实际展示的数据（经过筛选后）
    caseList: []
  },

  onLoad() {
    // 页面加载时，默认展示全部案例
    this.setData({ 
      caseList: this.data.originalList 
    });
  },

  // 监听搜索框输入
  onSearchInput(e) { 
    this.setData({ keyword: e.detail.value });
    this.filterData(); // 每次输入都触发筛选
  },

  // 切换分类标签
  switchType(e) { 
    this.setData({ currentType: e.currentTarget.dataset.type });
    this.filterData(); // 每次点击标签都触发筛选
  },

  // 🌟 核心：筛选逻辑（根据分类 + 搜索词）
  filterData() {
    const { originalList, currentType, keyword } = this.data;
    
    // 过滤条件
    const filteredList = originalList.filter(item => {
      // 1. 判断分类
      const matchType = (currentType === '全部') || (item.type === currentType);
      // 2. 判断搜索词（无关键词则默认匹配）
      const matchKeyword = !keyword || 
        item.title.includes(keyword) || 
        item.summary.includes(keyword) || 
        item.city.includes(keyword) ||
        item.type.includes(keyword);
      
      return matchType && matchKeyword;
    });

    // 更新页面数据
    this.setData({ caseList: filteredList });
  },

  // 跳转详情页
  goToDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/cases/case-detail?id=${id}`
    });
  }
});