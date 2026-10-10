// pages/about/about.js
Page({
  data: {
    version: '1.0.0',
    description: '妈妈岗宝妈轻量交流社区',
    team: [
      { name: '周勤希', role: '开发负责人' },
      { name: '黄炜怡', role: '原型设计' },
      { name: '李泽亚', role: '数据整理' }
    ]
  },

  onLoad() {},

  // 复制仓库地址
  onCopyRepo() {
    wx.setClipboardData({
      data: 'https://github.com/ciciyanyao/mama-gang-community.git',
      success: () => {
        wx.showToast({
          title: '已复制仓库地址',
          icon: 'success'
        })
      }
    })
  }
})