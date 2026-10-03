// app.js —— 小程序全局入口
App({
  onLaunch() {
    // 云开发初始化：env 填你自己的云环境 ID（云开发控制台-环境-环境ID，形如 mama-gang-1gxxxxx）
    if (wx.cloud) {
      wx.cloud.init({
        env: 'YOUR_CLOUD_ENV_ID', // TODO: 开通云开发后替换为真实环境 ID
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
