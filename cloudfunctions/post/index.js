// cloudfunctions/post/index.js —— 帖子云函数（类 C：发帖与内容安全）
// action: create / list / detail / delete
// create 内含：文本审核 msgSecCheck + 图片/视频审核 mediaCheckAsync，不过审直接拦截
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const posts = db.collection('posts')
const users = db.collection('users')

// 板块枚举（与 config/index.js 保持一致）
const CATEGORIES = ['求职交流', '职场经验', '育儿互助', '情绪倾诉', '政策资讯']

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  const action = event.action || 'list'

  switch (action) {
    case 'create':
      return await createPost(event, OPENID)
    case 'list':
      return await getPostList(event)
    case 'detail':
      return await getPostDetail(event)
    case 'delete':
      return await deletePost(event, OPENID)
    default:
      return { code: -1, msg: '未知操作' }
  }
}

// ========== 创建帖子（含内容安全审核） ==========
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
    authorId: user._id,
    openid,               // 冗余 openid 方便查询（仅服务端可见，不外泄）
    title: title.trim(),
    content: content.trim(),
    images,
    category: mainCategory,    // 主分类（第一个选中的板块）
    categories: allCategories, // 全部分类（支持多选）
    is_anonymous: !!is_anonymous,
    is_top: false,
    likeCount: 0,
    commentCount: 0,
    status: 1,            // 0待审 / 1已发布 / 2已删除（审核通过直接已发布）
    created_at: db.serverDate(),
    updated_at: db.serverDate()
  }
  const addRes = await posts.add({ data: postData })
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

// ========== 帖子列表（分页） ==========
async function getPostList(event) {
  const { category, is_anonymous, page = 1, pageSize = 20 } = event
  const query = {}
  if (category) query.category = category
  if (typeof is_anonymous === 'boolean') query.is_anonymous = is_anonymous
  query.status = 1  // 只返回已发布

  const skip = (page - 1) * pageSize
  const res = await posts
    .where(query)
    .orderBy('created_at', 'desc')
    .skip(skip)
    .limit(pageSize)
    .get()

  // 补充作者昵称头像（匿名帖不返回）
  const list = await Promise.all(res.data.map(async p => {
    if (p.is_anonymous) {
      return { ...p, authorNickname: '匿名用户', authorAvatar: '' }
    }
    const uRes = await users.doc(p.authorId).get().catch(() => null)
    const u = uRes && uRes.data
    return { ...p, authorNickname: u ? u.nickname : '匿名用户', authorAvatar: u ? u.avatar : '' }
  }))

  return { code: 0, data: list }
}

// ========== 帖子详情 ==========
async function getPostDetail(event) {
  const { id } = event
  if (!id) return { code: -1, msg: '缺少帖子ID' }
  const res = await posts.doc(id).get().catch(() => null)
  if (!res || !res.data) return { code: -1, msg: '帖子不存在或已删除' }
  const post = res.data
  if (post.status !== 1) return { code: -1, msg: '帖子不存在或已删除' }

  // 补充作者信息
  if (!post.is_anonymous) {
    const uRes = await users.doc(post.authorId).get().catch(() => null)
    const u = uRes && uRes.data
    post.authorNickname = u ? u.nickname : '匿名用户'
    post.authorAvatar = u ? u.avatar : ''
  } else {
    post.authorNickname = '匿名用户'
    post.authorAvatar = ''
  }
  return { code: 0, data: post }
}

// ========== 删除帖子（仅本人或管理员） ==========
async function deletePost(event, openid) {
  const { id } = event
  if (!id) return { code: -1, msg: '缺少帖子ID' }

  const postRes = await posts.doc(id).get().catch(() => null)
  if (!postRes || !postRes.data) return { code: -1, msg: '帖子不存在' }
  const post = postRes.data

  // 校验权限：本人 or 管理员
  if (post.openid !== openid) {
    const uRes = await users.where({ openid }).get()
    const me = uRes.data[0]
    if (!me || me.role !== 2) return { code: -1, msg: '无权限删除' }
  }

  await posts.doc(id).update({ data: { status: 2, updated_at: db.serverDate() } })
  return { code: 0, msg: '已删除' }
}
