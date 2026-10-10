// cloudfunctions/login/index.js —— 登录云函数（双协议兼容）
// 兼容两套前端调用约定：
//   main 协议（utils/auth.js + components/login-modal）：action=login / updateProfile，返回 { code, data }
//   Lzy 协议（B/F 页面，如 mine.js）：action=getUserInfo / updateUserInfo / 不传 action，返回 { code, openid, userInfo }
// 用户记录查询同时兼容 _openid（云开发标准）与 openid（旧约定）两种字段。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  const action = event.action || 'login'
  const users = db.collection('users')

  // ============ 通用工具：查用户（兼容 _openid / openid 两种字段） ============
  async function findUser() {
    let res = await users.where({ _openid: OPENID }).limit(1).get()
    if (res.data.length > 0) return res.data[0]
    res = await users.where({ openid: OPENID }).limit(1).get()
    return res.data[0] || null
  }

  // 查不到则创建记录（两个字段都写入，兼容两套查询方式）
  async function getOrCreateUser(userInfo = {}) {
    let user = await findUser()
    if (!user) {
      const newUser = {
        _openid: OPENID,
        openid: OPENID,
        nickname: userInfo.nickName || userInfo.nickname || '',
        avatar: userInfo.avatarUrl || userInfo.avatar || '',
        gender: 'female',
        role: 0, // 0 宝妈 / 1 企业HR / 2 管理员
        create_time: db.serverDate(),
        created_at: db.serverDate(),
        updated_at: db.serverDate()
      }
      const addRes = await users.add({ data: newUser })
      user = { _id: addRes._id, ...newUser }
    }
    return user
  }

  // ============ main 协议：静默登录（auth.js silentLogin） ============
  if (action === 'login') {
    try {
      const user = await getOrCreateUser(event)
      return { code: 0, data: user }
    } catch (err) {
      console.error('登录失败', err)
      return { code: -1, msg: '登录失败', error: err.message }
    }
  }

  // ============ main 协议：完善资料（login-modal saveProfile） ============
  if (action === 'updateProfile') {
    const { nickname, avatar, gender } = event
    if (!nickname || !avatar) {
      return { code: -1, msg: '昵称和头像不能为空' }
    }
    try {
      const updateData = {
        nickname,
        avatar,
        gender: gender === 'male' ? 'male' : 'female',
        updated_at: db.serverDate()
      }
      await users.where({ _openid: OPENID }).update({ data: updateData })
      await users.where({ openid: OPENID }).update({ data: updateData })
      const user = await findUser()
      return { code: 0, data: user }
    } catch (err) {
      console.error('保存资料失败', err)
      return { code: -1, msg: '保存失败', error: err.message }
    }
  }

  // ============ Lzy 协议：获取用户信息 ============
  if (action === 'getUserInfo') {
    try {
      const user = await findUser()
      if (!user) {
        return { code: -1, message: '用户不存在' }
      }
      return { code: 0, data: user }
    } catch (err) {
      console.error('获取用户信息失败', err)
      return { code: -1, message: '获取用户信息失败', error: err.message }
    }
  }

  // ============ Lzy 协议：更新用户信息 ============
  if (action === 'updateUserInfo') {
    try {
      const { userInfo } = event
      const updateData = {
        nickname: userInfo.nickName,
        avatar: userInfo.avatarUrl,
        update_time: db.serverDate()
      }
      await users.where({ _openid: OPENID }).update({ data: updateData })
      await users.where({ openid: OPENID }).update({ data: updateData })
      return { code: 0, message: '更新成功' }
    } catch (err) {
      console.error('更新用户信息失败', err)
      return { code: -1, message: '更新失败', error: err.message }
    }
  }

  // ============ 默认分支（Lzy mine.js 等不传 action）：返回 openid + userInfo ============
  try {
    const user = await getOrCreateUser(event)
    return {
      code: 0,
      openid: OPENID,
      userInfo: user
        ? { nickName: user.nickname || '妈妈岗用户', avatarUrl: user.avatar || '', role: user.role || 0 }
        : null
    }
  } catch (err) {
    console.error('登录失败', err)
    return { code: -1, message: '登录失败', error: err.message }
  }
}
