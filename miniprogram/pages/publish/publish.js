// pages/publish/publish.js —— 发帖页（tab 2，中间"+"）：A3 参与门槛
// 未登录进入发帖页 → 就地弹出登录界面（不再跳转"我的"）
const auth = require('../../utils/auth.js')

Page({
  data: { title: '发帖', isLogin: false },
  onLoad() {},
  onShow() {
    // 自定义 tabBar：同步当前选中 tab
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 })
    }
    // 参与门槛：未登录 → 就地弹出登录界面
    this.setData({ isLogin: auth.isLogin() })
    if (!auth.isLogin()) {
      this.selectComponent('#loginModal').show()
    }
  },
  // 登录成功回调
  onLoginSuccess() {
    this.setData({ isLogin: true })
    // 登录成功后停留发帖页，等 C1 发帖功能做好后可直接开始写帖
  }
})
