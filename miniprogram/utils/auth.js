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
  if (app) {
    app.globalData.userInfo = user
    // 同步 openid，保证依赖 globalData.openid 的页面（如帖子详情点赞）登录后可用
    app.globalData.openid = (user && (user.openid || user._openid)) || app.globalData.openid
  }
}

// 清空登录态（退出登录用）
function clearUserInfo() {
  wx.removeStorageSync(LOGIN_KEY)
  const app = getApp()
  if (app) {
    app.globalData.userInfo = null
    app.globalData.openid = null
  }
}

// 静默登录：进入小程序即调用，建/取 users 记录，全程无弹窗
// 已完善资料的用户会同步本地缓存；游客只建记录不打扰
function silentLogin() {
  return wx.cloud.callFunction({ name: 'login', data: { action: 'login' } })
    .then(res => {
      if (res.result && res.result.code === 0) {
        const user = res.result.data
        const app = getApp()
        // 游客也有 openid（用于浏览态判断），登录态仍由 storage 的 nickname 决定
        if (app) app.globalData.openid = (user && (user.openid || user._openid)) || null
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
// page = 当前页面实例（this），页面需嵌入 <login-modal id="loginModal" />
// 已登录返回 true，可继续操作；未登录就地弹出登录弹窗（保持原操作界面），返回 false
// 若页面未嵌入 login-modal 组件，兜底跳转"我的"页登录
function requireLogin(page) {
  if (isLogin()) return true
  const modal = page && page.selectComponent && page.selectComponent('#loginModal')
  if (modal) {
    modal.show()
  } else {
    wx.switchTab({ url: '/pages/mine/mine' })
  }
  return false
}

module.exports = { isLogin, getUserInfo, setUserInfo, clearUserInfo, silentLogin, requireLogin }
