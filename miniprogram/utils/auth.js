// utils/auth.js —— 登录态统一管理
// 登录判定：本地 storage 的 userInfo 存在且 nickname 非空 = 已登录（登录=已完善头像昵称资料）
const LOGIN_KEY = 'userInfo'

// 是否已登录
function isLogin() {
  const u = wx.getStorageSync(LOGIN_KEY)
  return !!(u && u.nickname)
}

// 获取本地用户信息（未登录返回 null）
function getUserInfo() {
  return wx.getStorageSync(LOGIN_KEY) || null
}

// 保存用户信息（登录成功后调用，同步到全局）
function setUserInfo(user) {
  wx.setStorageSync(LOGIN_KEY, user)
  const app = getApp()
  if (app) app.globalData.userInfo = user
}

// 清空登录态（退出登录用）
function clearUserInfo() {
  wx.removeStorageSync(LOGIN_KEY)
  const app = getApp()
  if (app) app.globalData.userInfo = null
}

// 静默登录：进入小程序即调用，建/取 users 记录，全程无弹窗
// 已完善资料的用户会同步本地缓存；游客只建记录不打扰
function silentLogin() {
  return wx.cloud.callFunction({ name: 'login', data: { action: 'login' } })
    .then(res => {
      if (res.result && res.result.code === 0) {
        const user = res.result.data
        if (user.nickname) setUserInfo(user)
        return user
      }
      return null
    })
    .catch(err => {
      console.error('静默登录失败：', err)
      return null
    })
}

// 参与门槛：发帖/评论/点赞/收藏前调用
// 已登录返回 true；未登录弹窗引导去"我的"页并返回 false
function requireLogin() {
  if (isLogin()) return true
  wx.showModal({
    title: '需要登录',
    content: '登录后才能发帖、评论和互动，去"我的"页设置头像昵称即可',
    confirmText: '去登录',
    cancelText: '再看看',
    success(res) {
      if (res.confirm) {
        wx.switchTab({ url: '/pages/mine/mine' })
      }
    }
  })
  return false
}

module.exports = { isLogin, getUserInfo, setUserInfo, clearUserInfo, silentLogin, requireLogin }
