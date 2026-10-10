// cloudfunctions/favorite/index.js —— 收藏相关云函数
// actions: add / remove / check / list
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  const { action } = event

  switch (action) {
    case 'add':
      return await handleAdd(event, OPENID)
    case 'remove':
      return await handleRemove(event, OPENID)
    case 'check':
      return await handleCheck(event, OPENID)
    case 'list':
      return await handleList(event, OPENID)
    default:
      return { code: -1, message: '未知操作' }
  }
}

/**
 * 添加收藏
 * 参数：postId
 * 逻辑：检查是否已收藏，防重复
 */
async function handleAdd(event, openid) {
  try {
    const { postId } = event
    if (!postId) {
      return { code: -1, message: '缺少帖子ID' }
    }

    // 检查帖子是否存在
    const postRes = await db.collection('posts').doc(postId).get()
    if (!postRes.data) {
      return { code: -1, message: '帖子不存在' }
    }

    // 检查是否已收藏
    const existRes = await db.collection('favorites')
      .where({
        postId,
        _openid: openid
      })
      .limit(1)
      .get()

    if (existRes.data.length > 0) {
      return { code: -1, message: '已收藏过该帖子' }
    }

    // 添加收藏
    const addRes = await db.collection('favorites').add({
      data: {
        postId,
        _openid: openid,
        create_time: db.serverDate()
      }
    })

    return {
      code: 0,
      message: '收藏成功',
      data: { _id: addRes._id, postId }
    }
  } catch (err) {
    return { code: -1, message: '收藏失败', error: err.message }
  }
}

/**
 * 取消收藏
 * 参数：postId
 */
async function handleRemove(event, openid) {
  try {
    const { postId } = event
    if (!postId) {
      return { code: -1, message: '缺少帖子ID' }
    }

    // 查找收藏记录
    const existRes = await db.collection('favorites')
      .where({
        postId,
        _openid: openid
      })
      .limit(1)
      .get()

    if (existRes.data.length === 0) {
      return { code: -1, message: '未收藏该帖子' }
    }

    // 删除收藏记录
    await db.collection('favorites').doc(existRes.data[0]._id).remove()

    return {
      code: 0,
      message: '取消收藏成功',
      data: { postId }
    }
  } catch (err) {
    return { code: -1, message: '取消收藏失败', error: err.message }
  }
}

/**
 * 检查帖子是否已收藏
 * 参数：postId
 * 返回：{ isFavorite: boolean }
 */
async function handleCheck(event, openid) {
  try {
    const { postId } = event
    if (!postId) {
      return { code: -1, message: '缺少帖子ID' }
    }

    const res = await db.collection('favorites')
      .where({
        postId,
        _openid: openid
      })
      .limit(1)
      .get()

    return {
      code: 0,
      message: '获取成功',
      data: { isFavorite: res.data.length > 0 }
    }
  } catch (err) {
    return { code: -1, message: '检查收藏状态失败', error: err.message }
  }
}

/**
 * 获取用户收藏列表（含帖子详情）
 * 参数：page, pageSize
 */
async function handleList(event, openid) {
  try {
    const { page = 1, pageSize = 20 } = event
    const skip = (Math.max(1, parseInt(page)) - 1) * parseInt(pageSize)

    // 获取收藏记录
    const [countRes, favRes] = await Promise.all([
      db.collection('favorites').where({ _openid: openid }).count(),
      db.collection('favorites')
        .where({ _openid: openid })
        .orderBy('create_time', 'desc')
        .skip(skip)
        .limit(parseInt(pageSize))
        .get()
    ])

    if (favRes.data.length === 0) {
      return {
        code: 0,
        message: '获取成功',
        data: { list: [], total: 0, page: parseInt(page), pageSize: parseInt(pageSize), hasMore: false }
      }
    }

    // 批量获取帖子详情
    const postIds = favRes.data.map(f => f.postId).filter(Boolean)
    let postsMap = {}

    if (postIds.length > 0) {
      // 云数据库 where in 最多一次查 20 条，分批查询
      const batchSize = 20
      for (let i = 0; i < postIds.length; i += batchSize) {
        const batch = postIds.slice(i, i + batchSize)
        const postsRes = await db.collection('posts')
          .where({ _id: _.in(batch) })
          .get()
        postsRes.data.forEach(p => { postsMap[p._id] = p })
      }
    }

    // 组装收藏+帖子详情
    const list = favRes.data.map(fav => ({
      ...fav,
      post: postsMap[fav.postId] || null
    })).filter(item => item.post !== null) // 过滤掉帖子已被删除的

    return {
      code: 0,
      message: '获取成功',
      data: {
        list,
        total: countRes.total,
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        hasMore: skip + favRes.data.length < countRes.total
      }
    }
  } catch (err) {
    return { code: -1, message: '获取收藏列表失败', error: err.message }
  }
}