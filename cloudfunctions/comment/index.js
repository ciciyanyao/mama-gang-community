// cloudfunctions/comment/index.js —— 评论相关云函数
// actions: create / list / messageList / checkUnread / markRead
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  const { action } = event

  switch (action) {
    case 'create':
      return await handleCreate(event, OPENID)
    case 'list':
      return await handleList(event)
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

/**
 * 创建评论
 * 参数：postId, content
 * 逻辑：
 *   1. 写入 comments 集合，is_read: false（对帖子作者而言未读）
 *   2. 帖子的 commentCount +1
 */
async function handleCreate(event, openid) {
  try {
    const { postId, content, reply_to, reply_nickname } = event
    if (!postId || !content || !content.trim()) {
      return { code: -1, message: '缺少必要参数' }
    }

    // 验证帖子存在且未被删除
    const postRes = await db.collection('posts').doc(postId).get()
    if (!postRes.data || postRes.data.status === 2) {
      return { code: -1, message: '帖子不存在或已被删除' }
    }

    // 写入评论
    const commentData = {
      postId,
      authorId: openid,
      content: content.trim(),
      is_read: false, // 对帖子作者来说是未读的
      status: 1,      // 1=正常, 2=已删除
      create_time: db.serverDate()
    }
    // 支持回复指定评论（可选参数）
    if (reply_to) {
      commentData.reply_to = reply_to
      if (reply_nickname) commentData.reply_nickname = reply_nickname
    }

    const addRes = await db.collection('comments').add({ data: commentData })

    // 帖子评论数 +1
    await db.collection('posts').doc(postId).update({
      data: { commentCount: _.inc(1) }
    })

    return {
      code: 0,
      message: '评论成功',
      data: { _id: addRes._id, ...commentData }
    }
  } catch (err) {
    return { code: -1, message: '评论失败', error: err.message }
  }
}

/**
 * 获取某帖子的评论列表
 * 参数：postId, page, pageSize
 * 按 create_time 正序（最早评论在前）
 */
async function handleList(event) {
  try {
    const { postId, page = 1, pageSize = 20 } = event
    if (!postId) {
      return { code: -1, message: '缺少帖子ID' }
    }

    const skip = (Math.max(1, parseInt(page)) - 1) * parseInt(pageSize)
    const where = { postId, status: 1 }

    const [countRes, listRes] = await Promise.all([
      db.collection('comments').where(where).count(),
      db.collection('comments')
        .where(where)
        .orderBy('create_time', 'asc')
        .skip(skip)
        .limit(parseInt(pageSize))
        .get()
    ])

    // 为每条评论获取作者信息（昵称、头像）
    const comments = listRes.data
    const authorIds = [...new Set(comments.map(c => c.authorId).filter(Boolean))]

    if (authorIds.length > 0) {
      // 批量查用户信息（每次最多查100条）
      const userRes = await db.collection('users')
        .where({ openid: _.in(authorIds) })
        .get()

      const userMap = {}
      userRes.data.forEach(u => {
        userMap[u.openid] = { nickname: u.nickname, avatar: u.avatar }
      })

      comments.forEach(c => {
        c.authorInfo = userMap[c.authorId] || { nickname: '匿名用户', avatar: '' }
      })
    }

    return {
      code: 0,
      message: '获取成功',
      data: {
        list: comments,
        total: countRes.total,
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        hasMore: skip + comments.length < countRes.total
      }
    }
  } catch (err) {
    return { code: -1, message: '获取评论列表失败', error: err.message }
  }
}

/**
 * 获取消息列表（别人在我帖子下的评论）
 * 按 postId 聚合返回
 * 参数：page, pageSize（分页的是帖子维度）
 */
async function handleMessageList(event, openid) {
  try {
    const { page = 1, pageSize = 20 } = event

    // 第一步：获取当前用户的所有帖子ID
    const myPostsRes = await db.collection('posts')
      .where({ authorId: openid })
      .field({ _id: true, title: true })
      .get()

    if (myPostsRes.data.length === 0) {
      return {
        code: 0,
        message: '获取成功',
        data: { list: [], total: 0 }
      }
    }

    const myPostIds = myPostsRes.data.map(p => p._id)
    const postTitleMap = {}
    myPostsRes.data.forEach(p => { postTitleMap[p._id] = p.title })

    // 第二步：获取这些帖子下、别人发的评论（排除自己的评论）
    const commentsRes = await db.collection('comments')
      .where({
        postId: _.in(myPostIds),
        authorId: _.neq(openid),
        status: 1
      })
      .orderBy('create_time', 'desc')
      .limit(200) // 取最近200条用于聚合
      .get()

    if (commentsRes.data.length === 0) {
      return {
        code: 0,
        message: '获取成功',
        data: { list: [], total: 0 }
      }
    }

    // 第三步：批量获取评论作者信息
    const authorIds = [...new Set(commentsRes.data.map(c => c.authorId).filter(Boolean))]
    let userMap = {}
    if (authorIds.length > 0) {
      const userRes = await db.collection('users')
        .where({ openid: _.in(authorIds) })
        .get()
      userRes.data.forEach(u => {
        userMap[u.openid] = { nickname: u.nickname, avatar: u.avatar }
      })
    }

    // 第四步：按 postId 聚合
    const postCommentMap = {}
    commentsRes.data.forEach(c => {
      if (!postCommentMap[c.postId]) {
        postCommentMap[c.postId] = {
          postId: c.postId,
          postTitle: postTitleMap[c.postId] || '未知帖子',
          comments: [],
          latestTime: c.create_time,
          hasUnread: false
        }
      }
      postCommentMap[c.postId].comments.push({
        ...c,
        authorInfo: userMap[c.authorId] || { nickname: '匿名用户', avatar: '' }
      })
      if (!c.is_read) {
        postCommentMap[c.postId].hasUnread = true
      }
    })

    // 转为数组，按最新评论时间排序，分页
    const allGroups = Object.values(postCommentMap)
      .sort((a, b) => {
        const tA = a.latestTime ? new Date(a.latestTime).getTime() : 0
        const tB = b.latestTime ? new Date(b.latestTime).getTime() : 0
        return tB - tA
      })

    const skip = (Math.max(1, parseInt(page)) - 1) * parseInt(pageSize)
    const list = allGroups.slice(skip, skip + parseInt(pageSize))

    return {
      code: 0,
      message: '获取成功',
      data: {
        list,
        total: allGroups.length,
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        hasMore: skip + list.length < allGroups.length
      }
    }
  } catch (err) {
    return { code: -1, message: '获取消息列表失败', error: err.message }
  }
}

/**
 * 检查是否有未读评论
 * 返回：{ hasUnread: boolean, count: number }
 */
async function handleCheckUnread(event, openid) {
  try {
    // 获取当前用户的所有帖子ID
    const myPostsRes = await db.collection('posts')
      .where({ authorId: openid })
      .field({ _id: true })
      .get()

    if (myPostsRes.data.length === 0) {
      return { code: 0, message: '获取成功', data: { hasUnread: false, count: 0 } }
    }

    const myPostIds = myPostsRes.data.map(p => p._id)

    // 查询这些帖子下未读的、别人发的评论数量
    const countRes = await db.collection('comments')
      .where({
        postId: _.in(myPostIds),
        authorId: _.neq(openid),
        is_read: false,
        status: 1
      })
      .count()

    return {
      code: 0,
      message: '获取成功',
      data: {
        hasUnread: countRes.total > 0,
        count: countRes.total
      }
    }
  } catch (err) {
    return { code: -1, message: '检查未读失败', error: err.message }
  }
}

/**
 * 标记所有评论为已读
 * 将当前用户帖子下的所有未读评论标记为 is_read: true
 */
async function handleMarkRead(event, openid) {
  try {
    // 获取当前用户的所有帖子ID
    const myPostsRes = await db.collection('posts')
      .where({ authorId: openid })
      .field({ _id: true })
      .get()

    if (myPostsRes.data.length === 0) {
      return { code: 0, message: '无需标记', data: { updated: 0 } }
    }

    const myPostIds = myPostsRes.data.map(p => p._id)

    // 批量更新：将这些帖子下的未读评论标记为已读
    // 云数据库 update 的 where + limit 每次最多更新200条，循环处理
    let totalUpdated = 0
    let hasMore = true

    while (hasMore) {
      const updateRes = await db.collection('comments')
        .where({
          postId: _.in(myPostIds),
          authorId: _.neq(openid),
          is_read: false,
          status: 1
        })
        .limit(200)
        .update({
          data: { is_read: true }
        })

      const updated = updateRes.stats.updated || 0
      totalUpdated += updated
      hasMore = updated >= 200 // 如果更新了200条，可能还有更多
    }

    return {
      code: 0,
      message: '标记已读成功',
      data: { updated: totalUpdated }
    }
  } catch (err) {
    return { code: -1, message: '标记已读失败', error: err.message }
  }
}