// pages/publish/publish.js —— 发帖页（tab 2，中间"+"）
Page({
  data: { title: '发帖' },
  onLoad() {},
  onShow() {
    // 自定义 tabBar：同步当前选中 tab
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 })
    }
  }
})
