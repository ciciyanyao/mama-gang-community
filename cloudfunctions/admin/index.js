// cloudfunctions/admin/index.js —— 管理员专用云函数
// actions: deletePost / deleteComment / handleReport / getReportList / setTop / getAdminStats
// 所有操作前校验 role=2（管理员）
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  const { action } = event

  // 管理员权限校验（除 getAdminStats 外都需要）
  if (action !== 'getAdminStats') {
    const isAdmin = await checkAdmin(OPENID)
    if (!isAdmin) {
      return { code: -1, message: '无管理员权限' }
    }
  } else {
    // getAdminStats 也需要校验
    const isAdmin = await checkAdmin(OPENID)
    if (!isAdmin) {
      return { code: -1, message: '无管理员权限' }
    }
  }

  switch (action) {
    case 'deletePost':
      return await handleDeletePost(event)
    case 'deleteComment':
      return await handleDeleteComment(event)
    case 'handleReport':
      return await handleReport(event)
    case 'getReportList':
      return await handleGetReportList(event)
    case 'setTop':
      return await handleSetTop(event)
    case 'getAdminStats':
      return await handleGetAdminStats()
    default:
      return { code: -1, message: '未知操作' }
  }
}

/**
 * 校验是否为管理员（role=2）
 */
async function checkAdmin(openid) {
  try {
    const res = await db.collection('users')
      .where({ openid })
      .field({ role: true })
      .limit(1)
      .get()
    return res.data.length > 0 && res.data[0].role === 2
  } catch (err) {
    return false
  }
}

/**
 * 删除帖子（软删除，status=2）+ 级联删除评论
 * 参数：postId, reason(可选，删除原因)
 */
async function handleDeletePost(event) {
  try {
    const { postId, reason } = event
    if (!postId) {
      return { code: -1, message: '缺少帖子ID' }
    }

    // 软删除帖子
    await db.collection('posts').doc(postId).update({
      data: {
        status: 2,
        delete_reason: reason || '管理员删除',
        update_time: db.serverDate()
      }
    })

    // 级联软删除该帖子下的所有评论
    let totalDeleted = 0
    let hasMore = true
    while (hasMore) {
      const updateRes = await db.collection('comments')
        .where({ postId, status: 1 })
        .limit(200)
        .update({
          data: {
            status: 2,
            update_time: db.serverDate()
          }
        })
      const updated = updateRes.stats.updated || 0
      totalDeleted += updated
      hasMore = updated >= 200
    }

    return {
      code: 0,
      message: '删除成功',
      data: { postId, commentsDeleted: totalDeleted }
    }
  } catch (err) {
    return { code: -1, message: '删除帖子失败', error: err.message }
  }
}

/**
 * 删除评论（软删除，status=2）+ 帖子 commentCount -1
 * 参数：commentId
 */
async function handleDeleteComment(event) {
  try {
    const { commentId } = event
    if (!commentId) {
      return { code: -1, message: '缺少评论ID' }
    }

    // 获取评论信息（需要postId来更新计数）
    const commentRes = await db.collection('comments').doc(commentId).get()
    if (!commentRes.data) {
      return { code: -1, message: '评论不存在' }
    }

    const comment = commentRes.data

    // 软删除评论
    await db.collection('comments').doc(commentId).update({
      data: {
        status: 2,
        update_time: db.serverDate()
      }
    })

    // 帖子评论数 -1（确保不低于0）
    if (comment.postId) {
      await db.collection('posts').doc(comment.postId).update({
        data: {
          commentCount: _.inc(-1)
        }
      })
    }

    return {
      code: 0,
      message: '删除评论成功',
      data: { commentId }
    }
  } catch (err) {
    return { code: -1, message: '删除评论失败', error: err.message }
  }
}

/**
 * 处理举报
 * 参数：reportId, action: 'approve' | 'reject', reason(可选)
 * approve: 删除被举报内容（帖子/评论软删除）
 * reject: 标记举报为已驳回
 */
async function handleReport(event) {
  try {
    const { reportId, handleAction, reason } = event
    if (!reportId || !handleAction) {
      return { code: -1, message: '缺少必要参数' }
    }

    // 获取举报记录
    const reportRes = await db.collection('reports').doc(reportId).get()
    if (!reportRes.data) {
      return { code: -1, message: '举报记录不存在' }
    }

    const report = reportRes.data

    if (handleAction === 'approve') {
      // 通过举报 → 删除被举报内容
      if (report.targetType === 'post') {
        // 软删除帖子
        await db.collection('posts').doc(report.targetId).update({
          data: {
            status: 2,
            delete_reason: reason || '举报通过，管理员删除',
            update_time: db.serverDate()
          }
        })
        // 级联删除评论
        let hasMore = true
        while (hasMore) {
          const res = await db.collection('comments')
            .where({ postId: report.targetId, status: 1 })
            .limit(200)
            .update({ data: { status: 2, update_time: db.serverDate() } })
          hasMore = (res.stats.updated || 0) >= 200
        }
      } else if (report.targetType === 'comment') {
        // 软删除评论
        const commentRes = await db.collection('comments').doc(report.targetId).get()
        await db.collection('comments').doc(report.targetId).update({
          data: { status: 2, update_time: db.serverDate() }
        })
        // 帖子评论数 -1
        if (commentRes.data && commentRes.data.postId) {
          await db.collection('posts').doc(commentRes.data.postId).update({
            data: { commentCount: _.inc(-1) }
          })
        }
      }

      // 更新举报状态为已处理
      await db.collection('reports').doc(reportId).update({
        data: {
          status: 2, // 2=已通过
          handle_result: reason || '举报通过，内容已删除',
          handle_time: db.serverDate()
        }
      })

      return { code: 0, message: '举报已通过，内容已删除' }
    } else if (handleAction === 'reject') {
      // 驳回举报
      await db.collection('reports').doc(reportId).update({
        data: {
          status: 3, // 3=已驳回
          handle_result: reason || '举报不成立',
          handle_time: db.serverDate()
        }
      })

      return { code: 0, message: '举报已驳回' }
    } else {
      return { code: -1, message: '未知处理操作' }
    }
  } catch (err) {
    return { code: -1, message: '处理举报失败', error: err.message }
  }
}

/**
 * 获取举报列表（分页）
 * 参数：page, pageSize, status(可选: 1待处理/2已通过/3已驳回)
 */
async function handleGetReportList(event) {
  try {
    const { page = 1, pageSize = 20, status } = event
    const skip = (Math.max(1, parseInt(page)) - 1) * parseInt(pageSize)

    const where = {}
    if (status !== undefined && status !== '') {
      where.status = parseInt(status)
    }

    const [countRes, listRes] = await Promise.all([
      db.collection('reports').where(where).count(),
      db.collection('reports')
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
    return { code: -1, message: '获取举报列表失败', error: err.message }
  }
}

/**
 * 设置/取消置顶帖子
 * 参数：postId（切换 is_top 字段）
 */
async function handleSetTop(event) {
  try {
    const { postId } = event
    if (!postId) {
      return { code: -1, message: '缺少帖子ID' }
    }

    // 获取当前帖子的置顶状态
    const postRes = await db.collection('posts').doc(postId).get()
    if (!postRes.data) {
      return { code: -1, message: '帖子不存在' }
    }

    const newTopStatus = !postRes.data.is_top

    await db.collection('posts').doc(postId).update({
      data: {
        is_top: newTopStatus,
        update_time: db.serverDate()
      }
    })

    return {
      code: 0,
      message: newTopStatus ? '置顶成功' : '取消置顶成功',
      data: { postId, is_top: newTopStatus }
    }
  } catch (err) {
    return { code: -1, message: '设置置顶失败', error: err.message }
  }
}

/**
 * 获取管理后台统计数据（今日）
 * 返回：今日新增帖子数、今日新增评论数、待处理举报数、总用户数
 */
async function handleGetAdminStats() {
  try {
    // 获取今日零点时间
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // 并行查询各项统计
    const [newPostsRes, newCommentsRes, pendingReportsRes, totalUsersRes] = await Promise.all([
      // 今日新增帖子
      db.collection('posts')
        .where({ create_time: _.gte(today) })
        .count(),
      // 今日新增评论
      db.collection('comments')
        .where({ create_time: _.gte(today) })
        .count(),
      // 待处理举报（status=1）
      db.collection('reports')
        .where({ status: 1 })
        .count(),
      // 总用户数
      db.collection('users')
        .count()
    ])

    return {
      code: 0,
      message: '获取成功',
      data: {
        todayNewPosts: newPostsRes.total,
        todayNewComments: newCommentsRes.total,
        pendingReports: pendingReportsRes.total,
        totalUsers: totalUsersRes.total
      }
    }
  } catch (err) {
    return { code: -1, message: '获取统计数据失败', error: err.message }
  }
}