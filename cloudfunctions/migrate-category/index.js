// cloudfunctions/migrate-category/index.js —— 一次性数据迁移：老帖板块英文值 → 中文值
// 背景：早期发帖存英文板块（job/policy 等），现协议为中文（求职交流/政策资讯等）
// 作用：把 posts 集合里 category / categories 字段的英文值映射为中文，未知值保留并报告
// 用法：部署本云函数后，在云函数测试面板调用一次（无需参数），执行完可删除本云函数
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// 已知英文值 → 中文板块（按小写匹配）
const MAP = {
  job: '求职交流', jobs: '求职交流', work: '求职交流',
  career: '职场经验', experience: '职场经验',
  mom: '育儿互助', parenting: '育儿互助', help: '育儿互助', baby: '育儿互助',
  mood: '情绪倾诉', emotion: '情绪倾诉', emotional: '情绪倾诉',
  policy: '政策资讯', policies: '政策资讯', law: '政策资讯'
}

const VALID_CN = ['求职交流', '职场经验', '育儿互助', '情绪倾诉', '政策资讯']

exports.main = async () => {
  const batchSize = 100
  let skip = 0
  let updated = 0
  const unknown = {}

  while (true) {
    const res = await db.collection('posts')
      .where({ status: _.neq(-1) })
      .skip(skip)
      .limit(batchSize)
      .get()

    if (res.data.length === 0) break

    for (const post of res.data) {
      const upd = {}

      // 1. 主分类 category
      const oldCat = post.category
      if (typeof oldCat === 'string' && oldCat) {
        const key = oldCat.toLowerCase()
        if (MAP[key]) {
          if (post.category !== MAP[key]) upd.category = MAP[key]
        } else if (!VALID_CN.includes(oldCat)) {
          unknown[oldCat] = (unknown[oldCat] || 0) + 1
        }
      }

      // 2. 分类数组 categories
      const oldCats = post.categories
      if (Array.isArray(oldCats) && oldCats.length > 0) {
        const newCats = oldCats.map((c) => {
          if (typeof c !== 'string') return c
          const k = c.toLowerCase()
          return MAP[k] || c
        })
        const changed = newCats.some((c, i) => c !== oldCats[i])
        if (changed) upd.categories = newCats
      }

      if (Object.keys(upd).length > 0) {
        await db.collection('posts').doc(post._id).update({ data: upd })
        updated++
      }
    }

    skip += batchSize
  }

  return {
    code: 0,
    done: true,
    updated,
    unknown, // 无法识别的英文值（如存在，把这份列表发给我，我补充映射后重跑）
    note: '迁移完成。建议在微信开发者工具删除本 migrate-category 云函数。'
  }
}
