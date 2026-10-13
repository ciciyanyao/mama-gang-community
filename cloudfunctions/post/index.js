// cloudfunctions/post/index.js —— 帖子相关云函数
// actions: create / list / detail / hot / myPosts / like / delete
// 说明：融合版 —— main（类B论坛交流：list/detail/hot/myPosts/like）
//       + cici（类C发帖与内容安全：create 含文本/媒体审核、delete 软删）
// 返回协议：论坛 action 用 {code, message, data}，发帖 action 用 {code, msg, data}
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

const posts = db.collection('posts')
const users = db.collection('users')

// 每页条数
const PAGE_SIZE = 20

// 板块枚举（与 miniprogram/config/index.js 保持一致）
const CATEGORIES = ['求职交流', '职场经验', '育儿互助', '情绪倾诉', '政策资讯']

// djb2 hash（与前端 utils/anonymous.js 同一算法，保证前后端选中同一头像/昵称）
function hash(str) {
  let h = 5381
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h + str.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

// 收集对象里所有 cloud:// 开头的 fileID
function collectFileIds(obj, set = new Set()) {
  if (!obj || typeof obj !== 'object') return set
  for (const v of Object.values(obj)) {
    if (typeof v === 'string' && v.startsWith('cloud://')) set.add(v)
    else if (Array.isArray(v)) v.forEach(item => collectFileIds(item, set))
    else if (v && typeof v === 'object') collectFileIds(v, set)
  }
  return set
}

// 批量把 cloud:// fileID 换成临时 https URL（云函数管理员身份，绕过存储权限）
async function hydrateCloudUrls(list) {
  if (!Array.isArray(list) || list.length === 0) return list
  const fileIds = [...collectFileIds(list)]
  if (fileIds.length === 0) return list
  try {
    const res = await cloud.getTempFileURL({ fileList: fileIds })
    const map = {}
    (res.fileList || []).forEach(f => { map[f.fileID] = f.tempFileURL })
    // 递归替换
    const replace = (o) => {
      if (!o || typeof o !== 'object') return
      for (const k of Object.keys(o)) {
        const v = o[k]
        if (typeof v === 'string' && map[v]) o[k] = map[v]
        else if (Array.isArray(v)) v.forEach(replace)
        else if (v && typeof v === 'object') replace(v)
      }
    }
    list.forEach(replace)
  } catch (e) {
    console.error('hydrateCloudUrls 失败：', e)
  }
  return list
}

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  const { action } = event

  switch (action) {
    case 'create':
      return await createPost(event, OPENID)
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
    case 'delete':
      return await deletePost(event, OPENID)
    default:
      return { code: -1, message: '未知操作' }
  }
}

// ========== 创建帖子（含内容安全审核） ==========
// 来自 cici 分支（类C发帖）。写库字段已对齐论坛版读取：
//   authorId 存 openid（论坛 detail/hot 按 users.where({openid: authorId}) 查作者）
//   时间字段同时写 create_time（论坛 list/hot/myPosts 按此排序）与 created_at
async function createPost(event, openid) {
  const { title, content, images = [], category, categories = [], is_anonymous = false } = event

  // 1. 参数校验
  if (!title || !title.trim()) return { code: -1, msg: '标题不能为空' }
  if (!content || !content.trim()) return { code: -1, msg: '正文不能为空' }

  // 板块校验：兼容单选（category）和多选（categories 数组）
  let mainCategory = category
  let allCategories = categories
  if (Array.isArray(allCategories) && allCategories.length > 0) {
    // 多选模式：校验所有板块合法，主分类取第一个
    const invalid = allCategories.find(c => !CATEGORIES.includes(c))
    if (invalid) return { code: -1, msg: '板块不合法' }
    mainCategory = allCategories[0]
  } else if (mainCategory && CATEGORIES.includes(mainCategory)) {
    // 单选模式
    allCategories = [mainCategory]
  } else {
    return { code: -1, msg: '请选择板块' }
  }

  // 2. 文本审核：msgSecCheck（必须在云函数调用，用 access_token）
  // 把标题和正文合并审核，任一违规即拦截
  const fullText = `${title}\n${content}`
  try {
    const textRes = await cloud.openapi.security.msgSecCheck({ content: fullText })
    // errCode 0 = 正常；87014 = 内容违规
    if (textRes.errCode === 87014) {
      return { code: -2, msg: '内容包含违规信息，请修改后再发布' }
    }
    if (textRes.errCode !== 0) {
      console.error('文本审核异常：', textRes)
      return { code: -3, msg: '内容审核服务异常，请稍后重试' }
    }
  } catch (err) {
    console.error('文本审核调用失败：', err)
    return { code: -3, msg: '内容审核服务异常，请稍后重试' }
  }

  // 3. 图片/视频审核：mediaCheckAsync（异步，提交后轮询结果）
  if (images && images.length > 0) {
    const auditRes = await auditMediaList(images)
    if (!auditRes.pass) {
      return { code: -4, msg: auditRes.msg, failedIndex: auditRes.failedIndex }
    }
  }

  // 4. 获取用户信息（用于存储 authorId、匿名判断）
  const userRes = await users.where({ openid }).get()
  const user = userRes.data[0]
  if (!user) return { code: -1, msg: '用户不存在，请重新登录' }

  // 5. 写入 posts 集合
  const postData = {
    authorId: user.openid || user._id, // 论坛版按 openid 查作者，冗余兼容 _id
    authorName: user.nickname || '',   // 冗余作者昵称，供论坛列表/帖子卡片直接显示（历史帖无此字段则显示兜底）
    authorAvatar: user.avatar || '',   // 冗余作者头像
    openid,               // 冗余 openid 方便查询（仅服务端可见，不外泄）
    title: title.trim(),
    content: content.trim(),
    images,
    category: mainCategory,    // 主分类（第一个选中的板块）
    categories: allCategories, // 全部分类（支持多选）
    is_anonymous: !!is_anonymous,
    likeCount: 0,
    commentCount: 0,
    status: 1,            // 0待审 / 1已发布 / 2已删除（审核通过直接已发布）
    create_time: db.serverDate(), // 论坛版排序字段
    created_at: db.serverDate(),
    updated_at: db.serverDate()
  }
  const addRes = await posts.add({ data: postData })

  // 匿名帖：按 openid + postId 派生 deterministic anonymousId，前端据此哈希取头像/昵称
  // 同帖同人 → 同 ID；跨帖 → postId 不同 → ID 不同（满足"同帖固定、跨帖重洗"）
  if (postData.is_anonymous) {
    const anonId = hash(openid + '::' + addRes._id)
    await posts.doc(addRes._id).update({ data: { anonymousId: anonId } })
  }

  return { code: 0, data: { _id: addRes._id } }
}

// 批量审核媒体（图片/视频），全部通过才返回 pass=true
// 单条失败返回 pass=false + 失败索引 + 原因
async function auditMediaList(mediaList) {
  for (let i = 0; i < mediaList.length; i++) {
    const mediaUrl = mediaList[i]
    if (!mediaUrl) continue

    // 判断媒体类型：后缀名
    const isVideo = /\.(mp4|mov|avi|mkv|webm)$/i.test(mediaUrl)
    const mediaType = isVideo ? 2 : 1   // 1=图片 2=视频

    try {
      // 提交审核
      const submitRes = await cloud.openapi.security.mediaCheckAsync({
        media_url: mediaUrl,
        media_type: mediaType
      })
      const traceId = submitRes.trace_id
      if (!traceId) continue  // 未返回 trace_id，放行（避免阻塞）

      // 轮询结果（最多等 8 秒，每 1 秒查一次）
      const result = await pollMediaResult(traceId, 8)
      if (result && result.errcode === 0) {
        // result.suggest: pass / review / block
        // result.label: 违规类型
        if (result.suggest === 'block' || result.suggest === 'review') {
          return {
            pass: false,
            msg: `第${i + 1}个素材包含违规内容，请删除后重试`,
            failedIndex: i
          }
        }
      } else {
        console.warn(`媒体审核结果异常 traceId=${traceId}:`, result)
        // 异常放行，避免正常图片被误拦
      }
    } catch (err) {
      console.error(`媒体审核调用失败 index=${i}:`, err)
      // 审核服务异常时放行，避免阻塞正常发布
    }
  }
  return { pass: true }
}

// 轮询媒体审核结果
async function pollMediaResult(traceId, maxSeconds) {
  for (let s = 0; s < maxSeconds; s++) {
    try {
      const res = await cloud.openapi.security.mediaCheckAsync({ trace_id: traceId })
      if (res.errcode === 0 && res.suggest) {
        return res
      }
      // 还没出结果，等 1 秒再查
      await new Promise(r => setTimeout(r, 1000))
    } catch (err) {
      console.error('轮询媒体审核异常：', err)
      break
    }
  }
  return null  // 超时未拿到结果
}

// ========== 删除帖子（仅本人或管理员） ==========
// 来自 cici 分支（类C）。软删除：status 置 -1（与论坛列表 status != -1 过滤对齐，删掉即从论坛/热门榜消失）
async function deletePost(event, openid) {
  const { id } = event
  if (!id) return { code: -1, msg: '缺少帖子ID' }

  const postRes = await posts.doc(id).get().catch(() => null)
  if (!postRes || !postRes.data) return { code: -1, msg: '帖子不存在' }
  const post = postRes.data

  // 校验权限：本人（authorId 对齐 myPosts 查询口径；历史帖无 openid 字段，兼容两者） or 管理员
  if (post.authorId !== openid && post.openid !== openid) {
    const uRes = await users.where({ openid }).get()
    const me = uRes.data[0]
    if (!me || me.role !== 2) return { code: -1, msg: '无权限删除' }
  }

  await posts.doc(id).update({ data: { status: -1, updated_at: db.serverDate() } })
  return { code: 0, msg: '已删除' }
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
        .orderBy('create_time', 'desc')
        .skip(skip)
        .limit(parseInt(pageSize))
        .get()
    ])

    // 批量把 cloud:// fileID 换成临时 https URL（绕过云存储"仅创建者可读"限制）
    await hydrateCloudUrls(listRes.data)

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

    // 把 post 里的 cloud:// fileID 换成临时 https URL
    await hydrateCloudUrls([post])

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

    // 批量把 cloud:// fileID 换成临时 https URL（绕过云存储"仅创建者可读"限制）
    await hydrateCloudUrls(listRes.data)

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
