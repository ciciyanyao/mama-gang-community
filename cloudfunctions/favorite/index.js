// cloudfunctions/favorite/index.js —— 收藏功能云函数
// actions: add / remove / check / list / messageList
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  const { action } = event

  switch (action) {
    case 'add':
      return await handleAddFavorite(event, OPENID)
    case 'remove':
      return await handleRemoveFavorite(event, OPENID)
    case 'check':
      return await handleCheckFavorite(event, OPENID)
    case 'list':
      return await handleGetFavoriteList(event, OPENID)
    case 'messageList':
      return await handleMessageList(event, OPENID)
    default:
      return { code: -1, message: '未知操作' }
  }
}

// 添加收藏（冗余帖子作者 openid + is_read，供消息页"谁收藏了我的帖子"使用）
async function handleAddFavorite(event, openid) {
  const { postId } = event
  try {
    // 检查是否已收藏
    const existing = await db.collection('favorites')
      .where({ _openid: openid, postId })
      .limit(1)
      .get()

    if (existing.data.length > 0) {
      return { code: -1, message: '已收藏该帖子' }
    }

    let postAuthorId = ''
    try {
      const pRes = await db.collection('posts').doc(postId).get()
      postAuthorId = (pRes.data && (pRes.data.authorId || pRes.data.openid)) || ''
    } catch (e) {
      console.error('[favorite] 查帖子作者失败：', e)
    }

    await db.collection('favorites').add({
      data: {
        _openid: openid,
        postId,
        postAuthorId,
        is_read: false, // 对帖子作者而言未读
        create_time: db.serverDate()
      }
    })

    return { code: 0, message: '收藏成功' }
  } catch (err) {
    return { code: -1, message: '收藏失败', error: err.message }
  }
}

// 取消收藏
async function handleRemoveFavorite(event, openid) {
  const { postId } = event
  try {
    await db.collection('favorites')
      .where({ _openid: openid, postId })
      .remove()

    return { code: 0, message: '取消收藏成功' }
  } catch (err) {
    return { code: -1, message: '取消收藏失败', error: err.message }
  }
}

// 检查是否已收藏
async function handleCheckFavorite(event, openid) {
  const { postId } = event
  try {
    const result = await db.collection('favorites')
      .where({ _openid: openid, postId })
      .limit(1)
      .get()

    return { code: 0, data: { isFavorite: result.data.length > 0 } }
  } catch (err) {
    return { code: -1, message: '检查收藏状态失败', error: err.message }
  }
}

// 获取收藏列表
async function handleGetFavoriteList(event, openid) {
  const { page = 1, pageSize = 20 } = event
  const skip = (Math.max(1, parseInt(page)) - 1) * parseInt(pageSize)

  try {
    const favorites = await db.collection('favorites')
      .where({ _openid: openid })
      .orderBy('create_time', 'desc')
      .skip(skip)
      .limit(parseInt(pageSize))
      .get()

    // 获取帖子信息
    const posts = await Promise.all(
      favorites.data.map(async (fav) => {
        try {
          const post = await db.collection('posts').doc(fav.postId).get()
          return { ...post.data, favoriteTime: fav.create_time, favoriteId: fav._id }
        } catch (e) {
          return null
        }
      })
    )

    return {
      code: 0,
      data: posts.filter(Boolean)
    }
  } catch (err) {
    return { code: -1, message: '获取收藏列表失败', error: err.message }
  }
}

/**
 * 消息页"点赞与收藏"：我的帖子被别人收藏
 * 按帖子聚合返回（与 comment.messageList 同构）
 */
async function handleMessageList(event, openid) {
  try {
    const { page = 1, pageSize = 20 } = event

    const myPostsRes = await db.collection('posts')
      .where({ authorId: openid })
      .field({ _id: true, title: true })
      .get()

    if (myPostsRes.data.length === 0) {
      return { code: 0, message: '获取成功', data: { list: [], total: 0 } }
    }

    const myPostIds = myPostsRes.data.map(p => p._id)
    const postTitleMap = {}
    myPostsRes.data.forEach(p => { postTitleMap[p._id] = p.title })

    const favRes = await db.collection('favorites')
      .where({
        postId: _.in(myPostIds),
        _openid: _.neq(openid)
      })
      .orderBy('create_time', 'desc')
      .limit(200)
      .get()

    if (favRes.data.length === 0) {
      return { code: 0, message: '获取成功', data: { list: [], total: 0 } }
    }

    // 联表收藏者信息
    const favoriterIds = [...new Set(favRes.data.map(f => f._openid).filter(Boolean))]
    let userMap = {}
    if (favoriterIds.length > 0) {
      const userRes = await db.collection('users')
        .where({ openid: _.in(favoriterIds) })
        .get()
      userRes.data.forEach(u => {
        userMap[u.openid] = { nickname: u.nickname, avatar: u.avatar }
      })
    }

    // 按帖子聚合
    const postFavMap = {}
    favRes.data.forEach(f => {
      if (!postFavMap[f.postId]) {
        postFavMap[f.postId] = {
          postId: f.postId,
          postTitle: postTitleMap[f.postId] || '未知帖子',
          items: [],
          latestTime: f.create_time,
          hasUnread: false
        }
      }
      postFavMap[f.postId].items.push({
        ...f,
        authorInfo: userMap[f._openid] || { nickname: '匿名用户', avatar: '' }
      })
      if (!f.is_read) postFavMap[f.postId].hasUnread = true
    })

    const allGroups = Object.values(postFavMap)
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
    return { code: -1, message: '获取收藏消息失败', error: err.message }
  }
}