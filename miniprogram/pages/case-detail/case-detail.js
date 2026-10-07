// pages/case-detail/case-detail.js
Page({
  data: {
    // 详情数据（先写假数据，等云函数好了再改成动态获取）
    caseInfo: {
      _id: '1',
      title: '产假期间被辞退，法院判赔双倍工资',
      city: '广州',
      type: '劳动争议',
      summary: '李某产假期间被公司以旷工为由辞退，法院认定违法解除，判赔双倍赔偿金。',
      outcome: '法院判决公司支付李某违法解除劳动合同赔偿金共计 8.6 万元。',
      source: '广东省广州市中级人民法院 (2025) 粤01民终1234号'
    }
  },

  // 页面加载时，根据上个页面传来的 id 请求详情
  onLoad(options) {
    // options.id 就是从案例列表页传过来的 id
    // 等后台云函数好了，在这里调接口拉取对应的数据
  },

  // 返回上一页
  goBack() {
    const pages = getCurrentPages(); // 获取当前页面栈
    if (pages.length > 1) {
      // 如果有上一页，正常返回
      wx.navigateBack();
    } else {
      // 如果没有上一页（比如用户直接扫码进来），就跳回案例库列表
      wx.reLaunch({
        url: '/pages/cases/cases'
      });
    }
  }
});