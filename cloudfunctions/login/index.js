// cloudfunctions/login/index.js —— 登录云函数
// 作用：验证云开发连通性，获取openid，自动创建/更新用户记录
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  const { action, userInfo } = event

  switch (action) {
    case 'getUserInfo':
      return await handleGetUserInfo(OPENID)
    case 'updateUserInfo':
      return await handleUpdateUserInfo(OPENID, userInfo)
    default:
      // 默认登录，返回openid并确保用户记录存在
      return await handleLogin(OPENID, userInfo)
  }
}

// 处理登录：返回openid并自动创建用户记录
async function handleLogin(openid, userInfo) {
  try {
    // 检查用户是否已存在
    const userResult = await db.collection('users')
      .where({ _openid: openid })
      .get()

    if (userResult.data.length === 0) {
      // 新用户，创建记录
      await db.collection('users').add({
        data: {
          _openid: openid,
          nickname: userInfo?.nickName || '微信用户',
          avatar: userInfo?.avatarUrl || '',
          role: 0, // 0=普通用户, 1=HR, 2=管理员
          create_time: db.serverDate()
        }
      })
    }

    return {
      code: 0,
      openid: openid,
      userInfo: userResult.data[0] || null
    }
  } catch (err) {
    console.error('登录失败', err)
    return {
      code: -1,
      message: '登录失败',
      error: err.message
    }
  }
}

// 获取用户信息
async function handleGetUserInfo(openid) {
  try {
    const result = await db.collection('users')
      .where({ _openid: openid })
      .get()

    if (result.data.length > 0) {
      return {
        code: 0,
        data: result.data[0]
      }
    } else {
      return {
        code: -1,
        message: '用户不存在'
      }
    }
  } catch (err) {
    return {
      code: -1,
      message: '获取用户信息失败',
      error: err.message
    }
  }
}

// 更新用户信息
async function handleUpdateUserInfo(openid, userInfo) {
  try {
    await db.collection('users')
      .where({ _openid: openid })
      .update({
        data: {
          nickname: userInfo.nickName,
          avatar: userInfo.avatarUrl,
          update_time: db.serverDate()
        }
      })

    return {
      code: 0,
      message: '更新成功'
    }
  } catch (err) {
    return {
      code: -1,
      message: '更新失败',
      error: err.message
    }
  }
}
