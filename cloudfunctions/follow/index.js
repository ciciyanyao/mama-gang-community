// cloudfunctions/follow/index.js —— 关注功能云函数
// actions: follow / unfollow / check / messageList / checkUnread / markRead
// follows 集合 schema: { follower, followee, is_read, create_time }
//   follower = 主动关注者 openid；followee = 被关注者 openid
//   is_read 对 followee（被关注者）而言；create_time 用 db.serverDate()
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  const { action } = event

  switch (action) {
    case 'follow':
      return await handleFollow(event, OPENID)
    case 'unfollow':
      return await handleUnfollow(event, OPENID)
    case 'check':
      return await handleCheck(event, OPENID)
    case 'messageList':
      return await handleMessageList(event, OPENID)
    case 'checkUnread':
      return await handleCheckUnread(event, OPENID)
    case 'markRead':
      return await handleMarkRead(event, OPENID)
    default:
      return { code: -1, message: '未知操作' }
  }
}

// 关注某人
async function handleFollow(event, openid) {
  const { targetOpenid } = event
  if (!targetOpenid) return { code: -1, message: '缺少目标用户' }
  if (targetOpenid === openid) return { code: -1, message: '不能关注自己' }

  try {
    const existing = await db.collection('follows')
      .where({ follower: openid, followee: targetOpenid })
      .limit(1)
      .get()

    if (existing.data.length > 0) {
      return { code: -1, message: '已关注该用户' }
    }

    await db.collection('follows').add({
      data: {
        follower: openid,
        followee: targetOpenid,
        is_read: false, // 对被关注者而言未读
        create_time: db.serverDate()
      }
    })

    return { code: 0, message: '关注成功' }
  } catch (err) {
    return { code: -1, message: '关注失败', error: err.message }
  }
}

// 取消关注
async function handleUnfollow(event, openid) {
  const { targetOpenid } = event
  if (!targetOpenid) return { code: -1, message: '缺少目标用户' }

  try {
    await db.collection('follows')
      .where({ follower: openid, followee: targetOpenid })
      .remove()
    return { code: 0, message: '取消关注成功' }
  } catch (err) {
    return { code: -1, message: '取消关注失败', error: err.message }
  }
}

// 检查是否已关注某人
async function handleCheck(event, openid) {
  const { targetOpenid } = event
  if (!targetOpenid) return { code: -1, message: '缺少目标用户' }

  try {
    const result = await db.collection('follows')
      .where({ follower: openid, followee: targetOpenid })
      .limit(1)
      .get()
    return { code: 0, data: { isFollowing: result.data.length > 0 } }
  } catch (err) {
    return { code: -1, message: '检查关注状态失败', error: err.message }
  }
}

// 消息页"新增关注"：谁关注了我
async function handleMessageList(event, openid) {
  try {
    const { page = 1, pageSize = 20 } = event

    const followRes = await db.collection('follows')
      .where({ followee: openid, follower: _.neq(openid) })
      .orderBy('create_time', 'desc')
      .skip((Math.max(1, parseInt(page)) - 1) * parseInt(pageSize))
      .limit(parseInt(pageSize))
      .get()

    if (followRes.data.length === 0) {
      return { code: 0, message: '获取成功', data: { list: [], total: 0 } }
    }

    // 联表关注者信息
    const followerIds = [...new Set(followRes.data.map(f => f.follower).filter(Boolean))]
    let userMap = {}
    if (followerIds.length > 0) {
      const userRes = await db.collection('users')
        .where({ openid: _.in(followerIds) })
        .get()
      userRes.data.forEach(u => {
        userMap[u.openid] = { nickname: u.nickname, avatar: u.avatar }
      })
    }

    const items = followRes.data.map(f => ({
      id: f._id,
      follower: f.follower,
      authorInfo: userMap[f.follower] || { nickname: '匿名用户', avatar: '' },
      is_read: !!f.is_read,
      create_time: f.create_time
    }))

    const totalRes = await db.collection('follows')
      .where({ followee: openid, follower: _.neq(openid) })
      .count()

    return {
      code: 0,
      message: '获取成功',
      data: {
        list: items,
        total: totalRes.total,
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        hasMore: (Math.max(1, parseInt(page)) - 1) * parseInt(pageSize) + items.length < totalRes.total
      }
    }
  } catch (err) {
    return { code: -1, message: '获取新增关注消息失败', error: err.message }
  }
}

// 新增关注未读数（供 notify.checkUnread 汇总）
async function handleCheckUnread(event, openid) {
  try {
    const countRes = await db.collection('follows')
      .where({ followee: openid, follower: _.neq(openid), is_read: false })
      .count()
    return { code: 0, data: { count: countRes.total } }
  } catch (err) {
    return { code: -1, message: '检查新增关注未读失败', error: err.message }
  }
}

// 标记新增关注已读（循环批量更新，最多 200 条/次）
async function handleMarkRead(event, openid) {
  try {
    let totalUpdated = 0
    let hasMore = true
    while (hasMore) {
      const updateRes = await db.collection('follows')
        .where({ followee: openid, follower: _.neq(openid), is_read: false })
        .limit(200)
        .update({ data: { is_read: true } })
      const updated = updateRes.stats.updated || 0
      totalUpdated += updated
      hasMore = updated >= 200
    }
    return { code: 0, message: '标记已读成功', data: { updated: totalUpdated } }
  } catch (err) {
    return { code: -1, message: '标记已读失败', error: err.message }
  }
}
