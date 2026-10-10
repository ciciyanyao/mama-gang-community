// cloudfunctions/login/index.js —— 登录云函数（双 action）
// action=login         静默登录：查 users 集合，没有则建记录（openid/role=0/gender=female），无感、不弹窗
// action=updateProfile 完善资料（登录动作）：保存头像/昵称/性别，发帖评论前需先完成
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()//初始化
const users = db.collection('users') //获取数据库集合users的引用

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const action = event.action || 'login'

  // 静默登录：查 users，没有就建记录
  if (action === 'login') {
    const res = await users.where({ openid: OPENID }).get()
    let user = res.data[0]
    if (!user) {
      const newUser = {
        openid: OPENID,
        nickname: '',      // 空昵称 = 游客（未完成登录）
        avatar: '',        // 空头像
        gender: 'female',  // 性别默认女
        role: 0,           // 0 宝妈 / 1 企业HR / 2 管理员
        created_at: db.serverDate(),
        updated_at: db.serverDate()
      }
      const addRes = await users.add({ data: newUser })
      user = { _id: addRes._id, ...newUser }
    }
    return { code: 0, data: user }
  }

  // 完善资料（用户点击"完成登录"时调用）
  if (action === 'updateProfile') {
    const { nickname, avatar, gender } = event
    if (!nickname || !avatar) {
      return { code: -1, msg: '昵称和头像不能为空' }
    }
    await users.where({ openid: OPENID }).update({
      data: {
        nickname,
        avatar,
        gender: gender === 'male' ? 'male' : 'female',
        updated_at: db.serverDate()
      }
    })
    const res = await users.where({ openid: OPENID }).get()
    return { code: 0, data: res.data[0] }
  }

  return { code: -2, msg: '未知 action' }
}
