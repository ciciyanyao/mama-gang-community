// pages/mine/mine.js —— 我的页（tab 4）：登录入口（弹窗在 components/login-modal）
const auth = require('../../utils/auth.js')

Page({
  data: { isLogin: false, userInfo: null },
  onLoad() {},
  onShow() {
    // 自定义 tabBar：同步当前选中 tab
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 4 })
    }
    this.refreshLoginState()
  },
  refreshLoginState() {
    this.setData({
      isLogin: auth.isLogin(),
      userInfo: auth.getUserInfo()
    })
  },
  // 点"点击登录"就地弹出登录界面
  startLogin() {
    if (this.data.isLogin) return
    this.selectComponent('#loginModal').show()
  },
  // 登录成功回调（来自 login-modal 组件）
  onLoginSuccess() {
    this.refreshLoginState()
  }
})
