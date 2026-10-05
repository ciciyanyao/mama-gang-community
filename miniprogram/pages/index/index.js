// pages/index/index.js —— 论坛首页（tab 0）
Page({
  data: { title: '论坛' },
  onLoad() {},
  onShow() {
    // 自定义 tabBar：同步当前选中 tab
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 })
    }
  }
})
