// cloudfunctions/login/index.js —— 最小登录云函数
// 作用：验证云开发连通性，调用后返回当前用户的 openid
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async () => {
  const { OPENID } = cloud.getWXContext()
  return { openid: OPENID }
}
