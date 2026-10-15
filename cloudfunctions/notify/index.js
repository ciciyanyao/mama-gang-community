// cloudfunctions/notify/index.js —— 统一消息中心
// actions: checkUnread / markLikeFavRead / getMessageCenter / markAllRead
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// 收集对象里所有 cloud:// fileID
function collectFileIds(obj, set = new Set()) {
  if (!obj || typeof obj !== 'object') return set
  for (const v of Object.values(obj)) {
    if (typeof v === 'string' && v.startsWith('cloud://')) set.add(v)
    else if (Array.isArray(v)) v.forEach(item => collectFileIds(item, set))
    else if (v && typeof v === 'object') collectFileIds(v, set)
  }
  return set
}

// 批量把 cloud:// fileID 换成临时 https URL
async function hydrateCloudUrls(obj) {
  const fileIds = [...collectFileIds(obj)]
  if (fileIds.length === 0) return obj
  try {
    const res = await cloud.getTempFileURL({ fileList: fileIds })
    const map = {}
    ;(res.fileList || []).forEach(f => { map[f.fileID] = f.tempFileURL })
    const replace = (o) => {
      if (!o || typeof o !== 'object') return
      for (const k of Object.keys(o)) {
        const v = o[k]
        if (typeof v === 'string' && map[v]) o[k] = map[v]
        else if (Array.isArray(v)) v.forEach(replace)
        else if (v && typeof v === 'object') replace(v)
      }
    }
    replace(obj)
  } catch (e) {
    console.error('hydrateCloudUrls 失败：', e)
  }
  return obj
}

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  const { action } = event

  switch (action) {
    case 'checkUnread':
      return await handleCheckUnread(event, OPENID)
    case 'markLikeFavRead':
      return await handleMarkLikeFavRead(event, OPENID)
    case 'markCommentRead':
      return await handleMarkCommentRead(event, OPENID)
    case 'markFollowRead':
      return await handleMarkFollowRead(event, OPENID)
    case 'getMessageCenter':
      return await handleGetMessageCenter(event, OPENID)
    case 'markAllRead':
      return await handleMarkAllRead(event, OPENID)
    default:
      return { code: -1, message: '未知操作' }
  }
}

// 统一未读数：评论 + 点赞 + 收藏 + 关注 + 私信
async function handleCheckUnread(event, openid) {
  try {
    // 我的帖子 ID（评论/点赞/收藏三类共用）
    const myPostsRes = await db.collection('posts')
      .where({ authorId: openid })
      .field({ _id: true })
      .get()
    const myPostIds = myPostsRes.data.map(p => p._id)

    let commentUnread = 0
    let likeUnread = 0
    let favUnread = 0
    let followUnread = 0
    let messageUnread = 0

    const jobs = []

    // 评论未读
    if (myPostIds.length > 0) {
      jobs.push(
        db.collection('comments')
          .where({ postId: _.in(myPostIds), authorId: _.neq(openid), is_read: false, status: 1 })
          .count()
          .then(r => { commentUnread = r.total })
      )
      // 点赞未读（新数据带 is_read；历史无字段数据不计入，视为已读）
      jobs.push(
        db.collection('likes')
          .where({ postId: _.in(myPostIds), _openid: _.neq(openid), is_read: false })
          .count()
          .then(r => { likeUnread = r.total })
      )
      // 收藏未读
      jobs.push(
        db.collection('favorites')
          .where({ postId: _.in(myPostIds), _openid: _.neq(openid), is_read: false })
          .count()
          .then(r => { favUnread = r.total })
      )
    }

    // 关注未读
    jobs.push(
      db.collection('follows')
        .where({ followee: openid, follower: _.neq(openid), is_read: false })
        .count()
        .then(r => { followUnread = r.total })
    )

    // 私信未读
    jobs.push(
      db.collection('messages')
        .where({ to: openid, is_read: false })
        .count()
        .then(r => { messageUnread = r.total })
    )

    await Promise.all(jobs)

    const total = commentUnread + likeUnread + favUnread + followUnread + messageUnread

    return {
      code: 0,
      message: '获取成功',
      data: {
        total,
        detail: {
          comment: commentUnread,
          like: likeUnread,
          favorite: favUnread,
          follow: followUnread,
          message: messageUnread
        }
      }
    }
  } catch (err) {
    return { code: -1, message: '检查未读失败', error: err.message }
  }
}

// 标记"点赞 + 收藏"已读（我的帖子收到的赞/收藏）
async function handleMarkLikeFavRead(event, openid) {
  try {
    const myPostsRes = await db.collection('posts')
      .where({ authorId: openid })
      .field({ _id: true })
      .get()
    const myPostIds = myPostsRes.data.map(p => p._id)
    if (myPostIds.length === 0) {
      return { code: 0, message: '无需标记', data: { updated: 0 } }
    }

    const mark = async (collection) => {
      let total = 0
      let hasMore = true
      while (hasMore) {
        const updateRes = await db.collection(collection)
          .where({ postId: _.in(myPostIds), _openid: _.neq(openid), is_read: false })
          .limit(200)
          .update({ data: { is_read: true } })
        const updated = updateRes.stats.updated || 0
        total += updated
        hasMore = updated >= 200
      }
      return total
    }

    const [likeUpdated, favUpdated] = await Promise.all([
      mark('likes'),
      mark('favorites')
    ])

    return {
      code: 0,
      message: '标记已读成功',
      data: { like: likeUpdated, favorite: favUpdated }
    }
  } catch (err) {
    return { code: -1, message: '标记已读失败', error: err.message }
  }
}

// 评论分类已读：我的帖子收到的评论，逐批 is_read: true
async function handleMarkCommentRead(event, openid) {
  try {
    const myPostsRes = await db.collection('posts')
      .where({ authorId: openid })
      .field({ _id: true })
      .get()
    const myPostIds = myPostsRes.data.map(p => p._id)
    if (myPostIds.length === 0) {
      return { code: 0, message: '无需标记', data: { updated: 0 } }
    }

    let total = 0
    let hasMore = true
    while (hasMore) {
      const updateRes = await db.collection('comments')
        .where({ postId: _.in(myPostIds), authorId: _.neq(openid), is_read: false, status: 1 })
        .limit(200)
        .update({ data: { is_read: true } })
      const updated = updateRes.stats.updated || 0
      total += updated
      hasMore = updated >= 200
    }

    return { code: 0, message: '标记已读成功', data: { comment: total } }
  } catch (err) {
    return { code: -1, message: '标记已读失败', error: err.message }
  }
}

// 关注分类已读：收到的关注，逐批 is_read: true
async function handleMarkFollowRead(event, openid) {
  try {
    let total = 0
    let hasMore = true
    while (hasMore) {
      const updateRes = await db.collection('follows')
        .where({ followee: openid, follower: _.neq(openid), is_read: false })
        .limit(200)
        .update({ data: { is_read: true } })
      const updated = updateRes.stats.updated || 0
      total += updated
      hasMore = updated >= 200
    }

    return { code: 0, message: '标记已读成功', data: { follow: total } }
  } catch (err) {
    return { code: -1, message: '标记已读失败', error: err.message }
  }
}

// ==================== 消息中心聚合：一次返回评论/点赞/收藏/关注/私信 ====================
async function handleGetMessageCenter(event, openid) {
  try {
    // 第一步：查我的帖子（评论/点赞/收藏共用）
    const myPostsRes = await db.collection('posts')
      .where({ authorId: openid })
      .field({ _id: true, title: true })
      .get()
    const myPostIds = myPostsRes.data.map(p => p._id)
    const postTitleMap = {}
    myPostsRes.data.forEach(p => { postTitleMap[p._id] = p.title })

    // 并行查 4 个数据源
    const [commentsData, likesData, followsData, conversationsData] = await Promise.all([
      // 1. 评论消息（返回量收紧：最近 30 条，避免每次拉 200 条拖慢加载）
      myPostIds.length > 0
        ? db.collection('comments')
            .where({ postId: _.in(myPostIds), authorId: _.neq(openid), status: 1 })
            .orderBy('create_time', 'desc')
            .limit(30)
            .get()
        : Promise.resolve({ data: [] }),

      // 2. 点赞 + 收藏消息（各 30 条）
      myPostIds.length > 0
        ? Promise.all([
            db.collection('likes')
              .where({ postId: _.in(myPostIds), _openid: _.neq(openid) })
              .orderBy('create_time', 'desc')
              .limit(30)
              .get(),
            db.collection('favorites')
              .where({ postId: _.in(myPostIds), _openid: _.neq(openid) })
              .orderBy('create_time', 'desc')
              .limit(30)
              .get()
          ])
        : Promise.resolve([{ data: [] }, { data: [] }]),

      // 3. 关注消息
      db.collection('follows')
        .where({ followee: openid, follower: _.neq(openid) })
        .orderBy('create_time', 'desc')
        .limit(30)
        .get(),

      // 4. 私信会话（最近 80 条，够聚合出会话列表，避免一次拉 300 条）
      db.collection('messages')
        .where(_.or([{ from: openid }, { to: openid }]))
        .orderBy('create_time', 'desc')
        .limit(80)
        .get()
    ])

    // 收集所有需要联表的 user openid
    const userIds = new Set()
    commentsData.data.forEach(c => { if (c.authorId) userIds.add(c.authorId) })
    likesData[0].data.forEach(l => { if (l._openid) userIds.add(l._openid) })
    likesData[1].data.forEach(f => { if (f._openid) userIds.add(f._openid) })
    followsData.data.forEach(f => { if (f.follower) userIds.add(f.follower) })
    conversationsData.data.forEach(m => {
      if (m.from) userIds.add(m.from)
      if (m.to) userIds.add(m.to)
    })

    let userMap = {}
    if (userIds.size > 0) {
      const userRes = await db.collection('users')
        .where({ openid: _.in([...userIds]) })
        .get()
      userRes.data.forEach(u => {
        userMap[u.openid] = { nickname: u.nickname, avatar: u.avatar }
      })
    }

    // 组装评论列表（按帖子聚合）
    const postCommentMap = {}
    commentsData.data.forEach(c => {
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
      if (!c.is_read) postCommentMap[c.postId].hasUnread = true
    })
    const commentGroups = Object.values(postCommentMap).sort((a, b) => {
      const tA = a.latestTime ? new Date(a.latestTime).getTime() : 0
      const tB = b.latestTime ? new Date(b.latestTime).getTime() : 0
      return tB - tA
    })

    // 组装点赞+收藏列表（合并，按时间倒序）
    const likeItems = likesData[0].data.map(l => ({
      id: l._id,
      avatar: userMap[l._openid] ? (userMap[l._openid].avatar || '') : '',
      name: userMap[l._openid] ? (userMap[l._openid].nickname || '匿名用户') : '匿名用户',
      action: '赞了你的帖子',
      postTitle: postTitleMap[l.postId] || '帖子已删除',
      create_time: l.create_time,
      is_read: !!l.is_read,
      postId: l.postId
    }))
    const favItems = []
    likesData[1].data.forEach(f => {
      favItems.push({
        id: f._id,
        avatar: userMap[f._openid] ? (userMap[f._openid].avatar || '') : '',
        name: userMap[f._openid] ? (userMap[f._openid].nickname || '匿名用户') : '匿名用户',
        action: '收藏了你的帖子',
        postTitle: postTitleMap[f.postId] || '帖子已删除',
        create_time: f.create_time,
        is_read: !!f.is_read,
        postId: f.postId
      })
    })
    const likeFavList = [...likeItems, ...favItems]
      .sort((a, b) => new Date(b.create_time).getTime() - new Date(a.create_time).getTime())

    // 组装关注列表
    const followList = followsData.data.map(f => ({
      id: f._id,
      peer: f.follower,
      avatar: userMap[f.follower] ? (userMap[f.follower].avatar || '') : '',
      name: userMap[f.follower] ? (userMap[f.follower].nickname || '匿名用户') : '匿名用户',
      action: '关注了你',
      create_time: f.create_time,
      is_read: !!f.is_read
    }))

    // 组装私信会话列表
    const convMap = {}
    conversationsData.data.forEach(m => {
      const peer = m.from === openid ? m.to : m.from
      if (!peer) return
      if (!convMap[peer]) {
        convMap[peer] = { peer, lastMessage: m, unread: 0 }
      }
      if (!m.is_read && m.to === openid) convMap[peer].unread += 1
    })
    const conversations = Object.values(convMap)
      .sort((a, b) => new Date(b.lastMessage.create_time).getTime() - new Date(a.lastMessage.create_time).getTime())
      .map(c => ({
        peer: c.peer,
        avatar: userMap[c.peer] ? (userMap[c.peer].avatar || '') : '',
        nickname: userMap[c.peer] ? (userMap[c.peer].nickname || '宝妈用户') : '宝妈用户',
        lastMessage: c.lastMessage.content || '',
        create_time: c.lastMessage.create_time,
        unread: c.unread
      }))

    // 统计未读数
    const commentUnread = commentsData.data.filter(c => !c.is_read && c.authorId !== openid).length
    const likeFavUnread = [...likesData[0].data, ...likesData[1].data].filter(x => !x.is_read).length
    const followUnread = followsData.data.filter(f => !f.is_read).length

    const result = {
      commentGroups,
      likeFavList,
      followList,
      conversations,
      badges: {
        comment: commentUnread,
        likeFav: likeFavUnread,
        follow: followUnread
      }
    }

    // 批量换 cloud:// 图片临时 URL
    await hydrateCloudUrls(result)

    return { code: 0, message: '获取成功', data: result }
  } catch (err) {
    return { code: -1, message: '获取消息中心失败', error: err.message }
  }
}

// ==================== 一次标记全部已读 ====================
async function handleMarkAllRead(event, openid) {
  try {
    const myPostsRes = await db.collection('posts')
      .where({ authorId: openid })
      .field({ _id: true })
      .get()
    const myPostIds = myPostsRes.data.map(p => p._id)

    const markInBatches = async (collection, where) => {
      let total = 0
      let hasMore = true
      while (hasMore) {
        const res = await db.collection(collection)
          .where(where)
          .limit(200)
          .update({ data: { is_read: true } })
        const updated = res.stats.updated || 0
        total += updated
        hasMore = updated >= 200
      }
      return total
    }

    const jobs = []

    // 评论已读（我的帖子下的评论）
    if (myPostIds.length > 0) {
      jobs.push(markInBatches('comments', { postId: _.in(myPostIds), authorId: _.neq(openid), is_read: false }))
      jobs.push(markInBatches('likes', { postId: _.in(myPostIds), _openid: _.neq(openid), is_read: false }))
      jobs.push(markInBatches('favorites', { postId: _.in(myPostIds), _openid: _.neq(openid), is_read: false }))
    }

    // 关注已读
    jobs.push(markInBatches('follows', { followee: openid, follower: _.neq(openid), is_read: false }))

    await Promise.all(jobs)

    return { code: 0, message: '全部已读', data: { updated: true } }
  } catch (err) {
    return { code: -1, message: '标记已读失败', error: err.message }
  }
}
