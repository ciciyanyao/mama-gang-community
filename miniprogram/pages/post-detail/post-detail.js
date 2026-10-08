// pages/post-detail/post-detail.js —— 帖子详情：正文 + 评论/点赞/收藏（认领类 B 待建）
// 互动功能需登录：未登录就地弹出登录弹窗，保持原操作界面连贯
const auth = require('../../utils/auth.js')

Page({
  data: { title: '帖子详情', isLogin: false, userInfo: null },
  onLoad() {
    this.refreshLoginState()
  },
  onShow() {
    this.refreshLoginState()
  },
  refreshLoginState() {
    this.setData({ isLogin: auth.isLogin(), userInfo: auth.getUserInfo() })
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
  // 评论：需登录
  onTapComment() {
    if (!auth.requireLogin(this)) return
    wx.showToast({ title: '评论功能建设中', icon: 'none' })
  },
  // 登录成功回调（来自 login-modal 组件）
  onLoginSuccess() {
    this.refreshLoginState()
  }
})
