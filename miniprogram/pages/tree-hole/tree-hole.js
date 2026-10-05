// pages/tree-hole/tree-hole.js —— 树洞页（tab 3）
Page({
  data: { title: '树洞' },
  onLoad() {},
  onShow() {
    // 自定义 tabBar：同步当前选中 tab
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 3 })
    }
  }
})
