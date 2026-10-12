// pages/case-detail/case-detail.js
Page({
  data: {
    bgImage: '',
    caseInfo: {}
  },

  onLoad(options) {
    // 🚨 看看有没有拿到从列表页传来的 id
    console.log('详情页接收到的 id =', options.id); 

    // 1. 随机背景图
    const bgList = [
      '/pages/case-detail/paper/bg1.jpg',
      '/pages/case-detail/paper/bg2.jpg',
      '/pages/case-detail/paper/bg3.jpg',
      '/pages/case-detail/paper/bg4.jpg',
      '/pages/case-detail/paper/bg5.jpg'
    ];
    const randomBg = bgList[Math.floor(Math.random() * bgList.length)];
    this.setData({ bgImage: randomBg });

    // 2. 根据 id 获取数据（现在先直接用静态数据做演示，确保能跳过来）
    // 后续你要改成从云函数查数据库
    const allCases = [
      { _id: '1', title: '产假期间被辞退，法院判赔双倍工资', city: '广州', type: '劳动争议', summary: '李某产假期间被公司以旷工为由辞退，法院认定违法解除，判赔双倍赔偿金。', outcome: '法院判决公司支付李某违法解除劳动合同赔偿金共计 8.6 万元。', source: '广东省广州市中级人民法院 (2025) 粤01民终1234号' },
      { _id: '2', title: '生育津贴申领被拒，法院判决社保局重新核定', city: '深圳', type: '生育津贴', summary: '公司未足额缴纳生育保险，导致津贴标准降低，法院判决补足差额。', outcome: '法院判决社保局重新核定津贴标准，公司补足差额部分。', source: '广东省深圳市中级人民法院 (2025) 粤03民终5678号' },
      { _id: '3', title: '妈妈岗加班费争议，法院调解结案', city: '东莞', type: '工时纠纷', summary: '弹性工作制下加班费认定标准争议，最终调解结案，双方满意。', outcome: '经法院调解，双方达成一致，公司支付相应加班费补偿。', source: '广东省东莞市第三人民法院 (2025) 粤1903民初9012号' }
    ];

    const currentCase = allCases.find(item => item._id === options.id) || allCases[0];
    this.setData({ caseInfo: currentCase });
  },

  goBack() {
    const pages = getCurrentPages(); 
    if (pages.length > 1) {
      wx.navigateBack();
    } else {
      wx.reLaunch({ url: '/pages/cases/cases' });
    }
  },

  onLoginSuccess() {}
});