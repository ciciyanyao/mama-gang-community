// pages/case-detail/case-detail.js —— 案例详情：点赞 / 收藏（认领类 E 待建）
// 互动功能需登录：未登录就地弹出登录弹窗，保持原操作界面连贯
const auth = require('../../utils/auth.js')

Page({
  data: { title: '案例详情', isLogin: false },
  onLoad() {
    this.refreshLoginState()
  },
  onShow() {
    this.refreshLoginState()
  },
  refreshLoginState() {
    this.setData({ isLogin: auth.isLogin() })
  },
  // 点赞：需登录
  onTapLike() {
    if (!auth.requireLogin(this)) return
    wx.showToast({ title: '点赞功能建设中', icon: 'none' })
  },
  // 收藏：需登录
  onTapFavorite() {
    if (!auth.requireLogin(this)) return
    wx.showToast({ title: '收藏功能建设中', icon: 'none' })
  },
  // 登录成功回调（来自 login-modal 组件）
  onLoginSuccess() {
    this.refreshLoginState()
  }
})
