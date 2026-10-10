// cloudfunctions/favorite/index.js —— 收藏功能云函数
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
      return await handleAddFavorite(event, OPENID)
    case 'remove':
      return await handleRemoveFavorite(event, OPENID)
    case 'check':
      return await handleCheckFavorite(event, OPENID)
    case 'list':
      return await handleGetFavoriteList(event, OPENID)
    default:
      return { code: -1, message: '未知操作' }
  }
}

// 添加收藏
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

    await db.collection('favorites').add({
      data: {
        _openid: openid,
        postId,
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