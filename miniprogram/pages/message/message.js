// pages/message/message.js —— 消息页（tab 1）
Page({
  data: { title: '消息' },
  onLoad() {},
  onShow() {
    // 自定义 tabBar：同步当前选中 tab
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 })
    }
  }
})
