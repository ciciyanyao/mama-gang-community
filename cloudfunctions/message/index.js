// cloudfunctions/message/index.js —— 私信功能云函数
// actions: send / conversationList / messages / markRead / checkUnread
// messages 集合 schema: { from, to, content, is_read, create_time }
//   is_read 对 to（接收方）而言；create_time 用 db.serverDate()
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  const { action } = event

  switch (action) {
    case 'send':
      return await handleSend(event, OPENID)
    case 'conversationList':
      return await handleConversationList(event, OPENID)
    case 'messages':
      return await handleMessages(event, OPENID)
    case 'markRead':
      return await handleMarkRead(event, OPENID)
    case 'checkUnread':
      return await handleCheckUnread(event, OPENID)
    default:
      return { code: -1, message: '未知操作' }
  }
}

// 发送私信
async function handleSend(event, openid) {
  const { to, content } = event
  if (!to) return { code: -1, message: '缺少接收人' }
  if (!content || !content.trim()) return { code: -1, message: '消息不能为空' }
  if (to === openid) return { code: -1, message: '不能给自己发私信' }

  try {
    const addRes = await db.collection('messages').add({
      data: {
        from: openid,
        to,
        content: content.trim(),
        is_read: false, // 对接收方而言未读
        create_time: db.serverDate()
      }
    })
    return { code: 0, message: '发送成功', data: { _id: addRes._id } }
  } catch (err) {
    return { code: -1, message: '发送失败', error: err.message }
  }
}

// 会话列表：与我相关的消息按对端聚合，取每个会话最近一条 + 未读数
async function handleConversationList(event, openid) {
  try {
    const recent = await db.collection('messages')
      .where(_.or([{ from: openid }, { to: openid }]))
      .orderBy('create_time', 'desc')
      .limit(300)
      .get()

    if (recent.data.length === 0) {
      return { code: 0, message: '获取成功', data: { list: [], total: 0 } }
    }

    // 按对端聚合
    const convMap = {}
    recent.data.forEach(m => {
      const peer = m.from === openid ? m.to : m.from
      if (!peer) return
      if (!convMap[peer]) {
        convMap[peer] = {
          peer,
          lastMessage: m,
          unread: 0
        }
      }
      if (!m.is_read && m.to === openid) convMap[peer].unread += 1
    })

    // 联表对方信息
    const peerIds = Object.keys(convMap)
    let userMap = {}
    if (peerIds.length > 0) {
      const userRes = await db.collection('users')
        .where({ openid: _.in(peerIds) })
        .get()
      userRes.data.forEach(u => {
        userMap[u.openid] = { nickname: u.nickname, avatar: u.avatar }
      })
    }

    const list = Object.values(convMap)
      .sort((a, b) => {
        const tA = a.lastMessage.create_time ? new Date(a.lastMessage.create_time).getTime() : 0
        const tB = b.lastMessage.create_time ? new Date(b.lastMessage.create_time).getTime() : 0
        return tB - tA
      })
      .map(c => ({
        peer: c.peer,
        peerInfo: userMap[c.peer] || { nickname: '宝妈用户', avatar: '' },
        lastMessage: c.lastMessage,
        unread: c.unread
      }))

    return { code: 0, message: '获取成功', data: { list, total: list.length } }
  } catch (err) {
    return { code: -1, message: '获取会话列表失败', error: err.message }
  }
}

// 与某人的对话记录（分页，正序）
async function handleMessages(event, openid) {
  const { peer, page = 1, pageSize = 20 } = event
  if (!peer) return { code: -1, message: '缺少对话对象' }

  try {
    const skip = (Math.max(1, parseInt(page)) - 1) * parseInt(pageSize)
    const where = _.or([
      { from: openid, to: peer },
      { from: peer, to: openid }
    ])

    const [countRes, listRes] = await Promise.all([
      db.collection('messages').where(where).count(),
      db.collection('messages')
        .where(where)
        .orderBy('create_time', 'desc')
        .skip(skip)
        .limit(parseInt(pageSize))
        .get()
    ])

    // 倒序取出后翻转为正序展示
    const list = listRes.data.reverse()

    return {
      code: 0,
      message: '获取成功',
      data: {
        list,
        total: countRes.total,
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        hasMore: skip + listRes.data.length < countRes.total
      }
    }
  } catch (err) {
    return { code: -1, message: '获取对话记录失败', error: err.message }
  }
}

// 标记与某人的会话已读（对方发来的消息 → 已读）
async function handleMarkRead(event, openid) {
  const { peer } = event
  if (!peer) return { code: -1, message: '缺少对话对象' }

  try {
    let totalUpdated = 0
    let hasMore = true
    while (hasMore) {
      const updateRes = await db.collection('messages')
        .where({ from: peer, to: openid, is_read: false })
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

// 私信未读数（供 notify.checkUnread 汇总）
async function handleCheckUnread(event, openid) {
  try {
    const countRes = await db.collection('messages')
      .where({ to: openid, is_read: false })
      .count()
    return { code: 0, data: { count: countRes.total } }
  } catch (err) {
    return { code: -1, message: '检查私信未读失败', error: err.message }
  }
}
