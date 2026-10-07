// app.js —— 小程序全局入口
const { CLOUD_ENV_ID } = require('./config/index.js')
const { silentLogin } = require('./utils/auth.js')

App({
  onLaunch() {
    // 云开发初始化：env 统一从 config/index.js 读取（要换环境只改那一处）
    if (wx.cloud) {
      wx.cloud.init({
        env: CLOUD_ENV_ID,
        traceUser: true
      })
      // A3 静默登录：进入即在 users 集合建/取记录（无感知，不弹窗）
      silentLogin()
    } else {
      console.error('当前基础库版本过低，无法使用云能力，请升级基础库')
    }
  },
  globalData: {
    userInfo: null // 登录后存放用户信息
  }
})
