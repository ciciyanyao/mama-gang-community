// pages/settings/settings.js
const auth = require('../../utils/auth.js')
const { showSuccess, showError, confirm } = require('../../utils/util.js')

Page({
  data: {
    settings: {
      notification: true,
      darkMode: false
    },
    isLogin: false
  },

  onLoad() {
    this.loadSettings()
  },

  onShow() {
    // 登录态（控制"退出登录"项显示）
    this.setData({ isLogin: auth.isLogin() })
  },

  // 加载设置
  loadSettings() {
    const settings = wx.getStorageSync('userSettings') || this.data.settings
    this.setData({ settings })
  },

  // 通知开关变化
  onNotificationChange(e) {
    const settings = this.data.settings
    settings.notification = e.detail.value
    this.setData({ settings })
    this.saveSettings()
  },

  // 深色模式开关变化
  onDarkModeChange(e) {
    const settings = this.data.settings
    settings.darkMode = e.detail.value
    this.setData({ settings })
    this.saveSettings()
  },

  // 保存设置
  saveSettings() {
    wx.setStorageSync('userSettings', this.data.settings)
    showSuccess('设置已保存')
  },

  // 清除缓存
  async onClearCache() {
    const confirmed = await confirm('提示', '确定要清除缓存吗？清除后需要重新登录。')
    if (confirmed) {
      wx.clearStorageSync()
      showSuccess('清除成功')
    }
  },

  // 关于
  onAboutTap() {
    wx.navigateTo({
      url: '/subpkg/about/about'
    })
  },

  // 退出登录
  async onLogout() {
    const confirmed = await confirm('提示', '确定要退出登录吗？')
    if (!confirmed) return

    auth.clearUserInfo()
    this.setData({ isLogin: false })
    showSuccess('已退出登录')
    setTimeout(() => wx.navigateBack(), 600)
  }
})