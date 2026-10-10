// cloudfunctions/post/index.js —— 帖子相关云函数
// actions: list / detail / hot / myPosts / like
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// 每页条数
const PAGE_SIZE = 20

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  const { action } = event

  switch (action) {
    case 'list':
      return await handleList(event)
    case 'detail':
      return await handleDetail(event)
    case 'hot':
      return await handleHot(event)
    case 'myPosts':
      return await handleMyPosts(event, OPENID)
    case 'like':
      return await handleLike(event, OPENID)
    default:
      return { code: -1, message: '未知操作' }
  }
}

/**
 * 获取帖子列表（分页）
 * 参数：page(从1开始), pageSize, category(可选筛选板块)
 * 排序：is_top desc, create_time desc
 * 只返回 status=1 的帖子
 */
async function handleList(event) {
  try {
    const { page = 1, pageSize = PAGE_SIZE, category } = event
    const skip = (Math.max(1, parseInt(page)) - 1) * parseInt(pageSize)

    // 构建查询条件：已发布 + 可选板块筛选
    const where = { status: 1 }
    if (category && category !== '全部') {
      where.category = category
    }

    // 并行查询总数和列表数据
    const [countRes, listRes] = await Promise.all([
      db.collection('posts').where(where).count(),
      db.collection('posts')
        .where(where)
        .orderBy('is_top', 'desc')
        .orderBy('create_time', 'desc')
        .skip(skip)
        .limit(parseInt(pageSize))
        .get()
    ])

    return {
      code: 0,
      message: '获取成功',
      data: {
        list: listRes.data,
        total: countRes.total,
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        hasMore: skip + listRes.data.length < countRes.total
      }
    }
  } catch (err) {
    return { code: -1, message: '获取帖子列表失败', error: err.message }
  }
}

/**
 * 获取帖子详情
 * 参数：postId
 * 同时返回帖子作者信息（昵称、头像）
 */
async function handleDetail(event) {
  try {
    const { postId } = event
    if (!postId) {
      return { code: -1, message: '缺少帖子ID' }
    }

    const res = await db.collection('posts').doc(postId).get()
    const post = res.data

    // 如果帖子不是匿名的，获取作者信息
    if (!post.is_anonymous && post.authorId) {
      try {
        const userRes = await db.collection('users')
          .where({ openid: post.authorId })
          .limit(1)
          .get()
        if (userRes.data.length > 0) {
          post.authorInfo = {
            nickname: userRes.data[0].nickname,
            avatar: userRes.data[0].avatar
          }
        }
      } catch (e) {
        // 查不到作者不影响帖子返回
      }
    }

    return {
      code: 0,
      message: '获取成功',
      data: post
    }
  } catch (err) {
    return { code: -1, message: '获取帖子详情失败', error: err.message }
  }
}

/**
 * 获取热门帖子 TOP 10
 * 排序依据：likeCount + commentCount 降序
 * 条件：status=1（已发布）
 */
async function handleHot() {
  try {
    const res = await db.collection('posts')
      .where({ status: 1 })
      .limit(100) // 先取100条，在内存中排序取TOP10（云数据库不支持计算字段排序）
      .get()

    // 计算热度 = likeCount + commentCount，降序取前10
    const posts = res.data
      .map(p => ({
        ...p,
        hotScore: (p.likeCount || 0) + (p.commentCount || 0)
      }))
      .sort((a, b) => b.hotScore - a.hotScore)
      .slice(0, 10)

    return {
      code: 0,
      message: '获取成功',
      data: posts
    }
  } catch (err) {
    return { code: -1, message: '获取热门帖子失败', error: err.message }
  }
}

/**
 * 获取当前用户的帖子列表
 * 参数：page, pageSize
 */
async function handleMyPosts(event, openid) {
  try {
    const { page = 1, pageSize = PAGE_SIZE } = event
    const skip = (Math.max(1, parseInt(page)) - 1) * parseInt(pageSize)

    const where = { authorId: openid }

    const [countRes, listRes] = await Promise.all([
      db.collection('posts').where(where).count(),
      db.collection('posts')
        .where(where)
        .orderBy('create_time', 'desc')
        .skip(skip)
        .limit(parseInt(pageSize))
        .get()
    ])

    return {
      code: 0,
      message: '获取成功',
      data: {
        list: listRes.data,
        total: countRes.total,
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        hasMore: skip + listRes.data.length < countRes.total
      }
    }
  } catch (err) {
    return { code: -1, message: '获取我的帖子失败', error: err.message }
  }
}

/**
 * 点赞/取消点赞（toggle）
 * 参数：postId
 * 逻辑：
 *   1. 查询 likes 集合中是否已有该用户对该帖子的记录
 *   2. 有 → 删除记录并 -1 likeCount（取消点赞）
 *   3. 无 → 添加记录并 +1 likeCount（点赞）
 */
async function handleLike(event, openid) {
  try {
    const { postId } = event
    if (!postId) {
      return { code: -1, message: '缺少帖子ID' }
    }

    // 查询是否已点赞
    const likeRes = await db.collection('likes')
      .where({
        postId,
        _openid: openid
      })
      .limit(1)
      .get()

    if (likeRes.data.length > 0) {
      // 已点赞 → 取消
      await db.collection('likes').doc(likeRes.data[0]._id).remove()
      await db.collection('posts').doc(postId).update({
        data: { likeCount: _.inc(-1) }
      })
      return { code: 0, message: '取消点赞成功', data: { liked: false } }
    } else {
      // 未点赞 → 点赞
      await db.collection('likes').add({
        data: {
          postId,
          _openid: openid,
          create_time: db.serverDate()
        }
      })
      await db.collection('posts').doc(postId).update({
        data: { likeCount: _.inc(1) }
      })
      return { code: 0, message: '点赞成功', data: { liked: true } }
    }
  } catch (err) {
    return { code: -1, message: '点赞操作失败', error: err.message }
  }
}