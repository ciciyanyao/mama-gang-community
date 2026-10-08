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
  },
  // 退出登录：清空本地登录态（仅本地退出，下次进入静默登录会按 DB 记录恢复）
  logout() {
    wx.showModal({
      title: '退出登录',
      content: '确认退出登录？退出后浏览不受影响，互动需重新登录',
      confirmText: '退出',
      confirmColor: '#E54848',
      success: (res) => {
        if (res.confirm) {
          auth.clearUserInfo()
          this.refreshLoginState()
          wx.showToast({ title: '已退出登录', icon: 'success' })
        }
      }
    })
  }
})
