// cloudfunctions/cleanup-posts/index.js —— 一次性数据清理
// 背景：历史老帖按旧逻辑发布（旧字段 nickname/avatar、英文板块等），字段冗余；且存在重复帖。
// 作用：清空 posts 集合（含软删残渣），并清空关联的 comments / likes / favorites（避免孤儿数据）。
//       treehole（树洞）集合不受影响，users / cases / jobs 不受影响。
// 用法：部署本云函数后，在云函数测试面板调用一次（无需参数）。执行完建议删除本云函数。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// 循环清空集合：微信云数据库单次 remove 有限制，分批 get + 按 _id 删
async function clearCollection(name) {
  const batchSize = 100
  let removed = 0
  for (;;) {
    const res = await db.collection(name).limit(batchSize).get()
    if (res.data.length === 0) break
    const ids = res.data.map((d) => d._id)
    await db.collection(name).where({ _id: _.in(ids) }).remove()
    removed += ids.length
    if (ids.length < batchSize) break
  }
  return removed
}

exports.main = async () => {
  const result = {}
  try {
    result.posts = await clearCollection('posts')
  } catch (e) {
    result.postsError = e.message
  }
  try {
    result.comments = await clearCollection('comments')
  } catch (e) {
    result.commentsError = e.message
  }
  try {
    result.likes = await clearCollection('likes')
  } catch (e) {
    result.likesError = e.message
  }
  try {
    result.favorites = await clearCollection('favorites')
  } catch (e) {
    result.favoritesError = e.message
  }

  return {
    code: 0,
    done: true,
    deleted: result,
    note: '历史老帖与关联数据已清理。treehole/users/cases/jobs 未受影响。建议删除本 cleanup-posts 云函数，然后按新协议重新发布帖子。'
  }
}
