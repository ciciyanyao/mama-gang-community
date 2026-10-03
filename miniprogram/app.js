// app.js —— 小程序全局入口
App({
  onLaunch() {
    // 云开发初始化：env 填你自己的云环境 ID（云开发控制台-环境-环境ID，形如 mama-gang-1gxxxxx）
    if (wx.cloud) {
      wx.cloud.init({
        env: 'cloud1-d1gxqkgy5a1f2e31a', // 云开发环境 ID（已开通）
        traceUser: true
      })
    } else {
      console.error('当前基础库版本过低，无法使用云能力，请升级基础库')
    }
  },
  globalData: {
    userInfo: null // 登录后存放用户信息
  }
})
