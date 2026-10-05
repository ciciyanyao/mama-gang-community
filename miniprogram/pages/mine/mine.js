// pages/mine/mine.js —— 我的页（tab 4）
Page({
  data: { title: '我的' },
  onLoad() {},
  onShow() {
    // 自定义 tabBar：同步当前选中 tab
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 4 })
    }
  }
})
