// cloudfunctions/treehole/index.js —— 树洞云函数
// actions: post / list / hug
// 匿名性设计：投递不关联任何用户身份（不存 openid），仅生成随机匿名昵称；
// hug 去重使用 openid 存于服务端字段 huggers，不返回前端
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const treehole = db.collection('treehole')

// 随机匿名昵称池（与树洞页原假数据风格一致）
const NICKNAMES = [
  '好好吃顿饭', '简单就挺好', '捕捉小开心', '晚风没说话',
  '人间普通客', '午后有点闷', '日子有点沉', '安静喘口气',
  '倦了就歇会', '独自看街灯', '随日子浮沉', '听首温柔的歌'
]

// 单条内容长度上限（字符）
const MAX_CONTENT_LEN = 5000

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  const action = event.action || 'list'

  switch (action) {
    case 'post':
      return await postToTreehole(event, OPENID)
    case 'list':
      return await listTreehole(event)
    case 'hug':
      return await hugPost(event, OPENID)
    case 'myList':
      return await myListTreehole(event, OPENID)
    case 'detail':
      return await detailTreehole(event, OPENID)
    case 'delete':
      return await deleteTreehole(event, OPENID)
    default:
      return { code: -1, msg: '未知操作' }
  }
}

// ========== 投递树洞（仅纯文本，随机匿名昵称） ==========
// 匿名性说明：对"其他用户"完全匿名（昵称随机、不暴露身份）；
// 服务端存 authorId（openid）仅用于"我的树洞"查询与删除权限校验，绝不返回前端
async function postToTreehole(event, openid) {
  const content = (event.content || '').trim()
  if (!content) return { code: -1, msg: '内容不能为空' }
  if (content.length > MAX_CONTENT_LEN) return { code: -1, msg: '内容过长' }

  const nickname = NICKNAMES[Math.floor(Math.random() * NICKNAMES.length)]
  const addRes = await treehole.add({
    data: {
      nickname,
      content,
      hug_count: 0,
      huggers: [],              // 已抱抱用户的 openid（服务端去重，绝不返回前端）
      authorId: openid,         // 归属人（仅服务端用：我的树洞/删除），不返回前端
      created_at: db.serverDate()
    }
  })
  return { code: 0, data: { _id: addRes._id, nickname } }
}

// ========== 我的树洞（按 authorId 查自己发的，分页） ==========
async function myListTreehole(event, openid) {
  try {
    const page = Math.max(1, parseInt(event.page) || 1)
    const pageSize = Math.min(Math.max(parseInt(event.pageSize) || 20, 1), 50)
    const skip = (page - 1) * pageSize

    const [listRes, countRes] = await Promise.all([
      treehole
        .where({ authorId: openid })
        .orderBy('created_at', 'desc')
        .skip(skip)
        .limit(pageSize)
        .get(),
      treehole.where({ authorId: openid }).count()
    ])

    const list = listRes.data.map(stripPrivate)
    return {
      code: 0,
      data: {
        list,
        total: countRes.total,
        page,
        pageSize,
        hasMore: skip + list.length < countRes.total
      }
    }
  } catch (err) {
    console.error('myListTreehole 异常：', err)
    return { code: -1, msg: '获取我的树洞失败' }
  }
}

// ========== 树洞单条详情（返回是否本人，用于右上角删除入口） ==========
async function detailTreehole(event, openid) {
  try {
    const { id } = event
    if (!id) return { code: -1, msg: '缺少帖子ID' }

    const res = await treehole.doc(id).get().catch(() => null)
    if (!res || !res.data) return { code: -1, msg: '内容不存在' }

    const post = res.data
    return {
      code: 0,
      data: {
        ...stripPrivate(post),
        isOwner: !!post.authorId && post.authorId === openid
      }
    }
  } catch (err) {
    console.error('detailTreehole 异常：', err)
    return { code: -1, msg: '获取详情失败' }
  }
}

// ========== 删除我的树洞帖（物理删除，仅本人） ==========
async function deleteTreehole(event, openid) {
  try {
    const { id } = event
    if (!id) return { code: -1, msg: '缺少帖子ID' }

    const res = await treehole.doc(id).get().catch(() => null)
    if (!res || !res.data) return { code: -1, msg: '内容不存在' }
    const post = res.data
    if (post.authorId && post.authorId !== openid) {
      return { code: -1, msg: '只能删除自己的树洞帖' }
    }

    await treehole.doc(id).remove()
    return { code: 0, msg: '已删除', data: { _id: id } }
  } catch (err) {
    console.error('deleteTreehole 异常：', err)
    return { code: -1, msg: '删除失败' }
  }
}

// ========== 树洞列表（按时间倒序，分页） ==========
async function listTreehole(event) {
  try {
    const page = Math.max(1, parseInt(event.page) || 1)
    const pageSize = Math.min(Math.max(parseInt(event.pageSize) || 20, 1), 50)
    const skip = (page - 1) * pageSize

    const [listRes, countRes] = await Promise.all([
      treehole
        .orderBy('created_at', 'desc')
        .skip(skip)
        .limit(pageSize)
        .get(),
      treehole.count()
    ])

    // 幂等补写示例：仅在集合为空时写入（每次进页面都查 marker 会很慢，先判断 total）
    let finalListRes = listRes
    if (countRes.total === 0) {
      await seedTreehole()
      finalListRes = await treehole
        .orderBy('created_at', 'desc')
        .skip(skip)
        .limit(pageSize)
        .get()
    }

    // 只返回展示字段，剥掉 huggers（匿名性）
    const list = finalListRes.data.map(stripPrivate)

    return {
      code: 0,
      data: {
        list,
        total: countRes.total,
        page,
        pageSize,
        hasMore: skip + list.length < countRes.total
      }
    }
  } catch (err) {
    console.error('listTreehole 异常：', err)
    return { code: -1, msg: '获取树洞失败' }
  }
}

// 剥离服务端字段（huggers 等），只返回展示所需
function stripPrivate(p) {
  return {
    _id: p._id,
    nickname: p.nickname,
    mood: p.mood || '',
    content: p.content,
    hug_count: p.hug_count || 0,
    created_at: p.created_at
  }
}

// 初始示例内容（原前端假数据，保留情绪标签展示效果；幂等：已存在则跳过）
async function seedTreehole() {
  // 用第一条示例的正文作为"是否已写入示例"的判据
  const marker = '今天老二发烧到 39 度，老大在幼儿园又摔了。一边发烧一边抱着娃往医院跑，站在急诊走廊上突然就哭了，觉得自己好没用。'
  const existRes = await treehole.where({ content: marker }).count()
  if (existRes.total > 0) return // 示例已存在，跳过

  const now = Date.now()
  const seeds = [
    {
      nickname: '晚风没说话',
      mood: '崩溃',
      content: marker,
      hug_count: 46,
      huggers: [],
      created_at: new Date(now - 2 * 3600 * 1000) // 2小时前
    },
    {
      nickname: '简单就挺好',
      mood: '委屈',
      content: '婆婆当着亲戚的面说我「带个孩子都带不好」，我老公低头玩手机一句话没说。回房间关了灯才敢掉眼泪。',
      hug_count: 88,
      huggers: [],
      created_at: new Date(now - 26 * 3600 * 1000) // 昨天
    },
    {
      nickname: '捕捉小开心',
      mood: '治愈',
      content: '今天娃自己把玩具收好了，跑过来跟我说「妈妈你今天辛苦了」。就这一句话，我突然觉得两年全职也值了。',
      hug_count: 132,
      huggers: [],
      created_at: new Date(now - 30 * 3600 * 1000) // 昨天更早
    }
  ]
  for (const seed of seeds) {
    await treehole.add({ data: seed })
  }
  console.log('treehole 集合无示例内容，已补写初始示例')
}

// ========== 抱抱 / 取消抱抱（openid 去重 toggle） ==========
async function hugPost(event, openid) {
  try {
    const { id } = event
    if (!id) return { code: -1, msg: '缺少帖子ID' }

    const res = await treehole.doc(id).get().catch(() => null)
    if (!res || !res.data) return { code: -1, msg: '内容不存在' }
    const post = res.data
    const huggers = post.huggers || []
    const hugged = huggers.includes(openid)

    if (hugged) {
      // 已抱过 → 取消
      await treehole.doc(id).update({
        data: {
          huggers: _.pull(openid),
          hug_count: _.inc(-1)
        }
      })
      return {
        code: 0,
        msg: '已取消抱抱',
        data: { hugged: false, hug_count: Math.max((post.hug_count || 0) - 1, 0) }
      }
    } else {
      // 未抱过 → 抱抱
      await treehole.doc(id).update({
        data: {
          huggers: _.push(openid),
          hug_count: _.inc(1)
        }
      })
      return {
        code: 0,
        msg: '抱抱成功',
        data: { hugged: true, hug_count: (post.hug_count || 0) + 1 }
      }
    }
  } catch (err) {
    console.error('hugPost 异常：', err)
    return { code: -1, msg: '操作失败' }
  }
}
