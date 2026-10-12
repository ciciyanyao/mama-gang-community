// cloudfunctions/admin/index.js —— 管理端云函数
// actions: getAdminStats / getReportList / handleReport / deletePost / deleteComment / setTop
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  const { action } = event

  // 验证管理员权限
  const isAdmin = await checkAdminRole(OPENID)
  if (!isAdmin) {
    return { code: -1, message: '权限不足，需要管理员权限' }
  }

  switch (action) {
    case 'getAdminStats':
      return await handleGetAdminStats()
    case 'getReportList':
      return await handleGetReportList(event)
    case 'handleReport':
      return await handleReport(event)
    case 'deletePost':
      return await handleDeletePost(event)
    case 'deleteComment':
      return await handleDeleteComment(event)
    default:
      return { code: -1, message: '未知操作' }
  }
}

// 检查管理员权限
async function checkAdminRole(openid) {
  try {
    const user = await db.collection('users')
      .where({ _openid: openid, role: 2 })
      .limit(1)
      .get()
    return user.data.length > 0
  } catch (err) {
    console.error('检查管理员权限失败', err)
    return false
  }
}

// 获取管理统计数据
async function handleGetAdminStats() {
  try {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const [todayPosts, todayComments, pendingReports, totalUsers] = await Promise.all([
      db.collection('posts').where({ create_time: _.gte(today), status: 1 }).count(),
      db.collection('comments').where({ create_time: _.gte(today), status: 1 }).count(),
      db.collection('reports').where({ status: 1 }).count(),
      db.collection('users').count()
    ])

    return {
      code: 0,
      data: {
        todayPosts: todayPosts.total,
        todayComments: todayComments.total,
        pendingReports: pendingReports.total,
        totalUsers: totalUsers.total
      }
    }
  } catch (err) {
    return { code: -1, message: '获取统计数据失败', error: err.message }
  }
}

// 获取举报列表
async function handleGetReportList(event) {
  const { page = 1, pageSize = 20, status } = event
  const skip = (Math.max(1, parseInt(page)) - 1) * parseInt(pageSize)

  try {
    let query = db.collection('reports')
    if (status) {
      query = query.where({ status: parseInt(status) })
    }

    const result = await query
      .orderBy('create_time', 'desc')
      .skip(skip)
      .limit(parseInt(pageSize))
      .get()

    // 获取被举报内容信息
    const reports = await Promise.all(
      result.data.map(async (report) => {
        let targetInfo = null
        try {
          if (report.targetType === 'post') {
            const post = await db.collection('posts')
              .doc(report.targetId)
              .field({ title: true, content: true })
              .get()
            targetInfo = post.data
          } else if (report.targetType === 'comment') {
            const comment = await db.collection('comments')
              .doc(report.targetId)
              .field({ content: true })
              .get()
            targetInfo = comment.data
          }
        } catch (e) {
          // 内容已被删除
        }
        return { ...report, targetInfo }
      })
    )

    return {
      code: 0,
      data: {
        list: reports,
        hasMore: skip + result.data.length < (await db.collection('reports').where(status ? { status: parseInt(status) } : {}).count()).total
      }
    }
  } catch (err) {
    return { code: -1, message: '获取举报列表失败', error: err.message }
  }
}

// 处理举报
async function handleReport(event) {
  const { reportId, handleAction } = event

  try {
    const report = await db.collection('reports').doc(reportId).get()
    if (!report.data) {
      return { code: -1, message: '举报记录不存在' }
    }

    if (handleAction === 'approve') {
      // 批准举报，删除被举报内容
      if (report.data.targetType === 'post') {
        await handleDeletePost({ postId: report.data.targetId, reason: '举报批准：' + (report.data.reason || '') })
      } else if (report.data.targetType === 'comment') {
        await handleDeleteComment({ commentId: report.data.targetId, reason: '举报批准：' + (report.data.reason || '') })
      }

      await db.collection('reports').doc(reportId).update({
        data: { status: 2, handle_time: db.serverDate(), handle_result: 'approved' }
      })

      return { code: 0, message: '举报已批准，内容已删除' }
    } else if (handleAction === 'reject') {
      await db.collection('reports').doc(reportId).update({
        data: { status: 3, handle_time: db.serverDate(), handle_result: 'rejected' }
      })
      return { code: 0, message: '举报已驳回' }
    }

    return { code: -1, message: '未知处理动作' }
  } catch (err) {
    return { code: -1, message: '处理举报失败', error: err.message }
  }
}

// 删除帖子
async function handleDeletePost(event) {
  const { postId, reason } = event
  try {
    await db.collection('posts').doc(postId).update({
      data: { status: 2, delete_reason: reason || '管理员删除', delete_time: db.serverDate() }
    })

    // 同时隐藏该帖子下的评论
    await db.collection('comments')
      .where({ postId })
      .update({
        data: { status: 2, delete_reason: '帖子已被删除', delete_time: db.serverDate() }
      })

    return { code: 0, message: '删除帖子成功' }
  } catch (err) {
    return { code: -1, message: '删除帖子失败', error: err.message }
  }
}

// 删除评论
async function handleDeleteComment(event) {
  const { commentId, reason } = event
  try {
    const comment = await db.collection('comments').doc(commentId).get()
    await db.collection('comments').doc(commentId).update({
      data: { status: 2, delete_reason: reason || '管理员删除', delete_time: db.serverDate() }
    })

    // 更新帖子评论数
    if (comment.data && comment.data.postId) {
      await db.collection('posts')
        .doc(comment.data.postId)
        .update({ data: { commentCount: _.inc(-1) } })
    }

    return { code: 0, message: '删除评论成功' }
  } catch (err) {
    return { code: -1, message: '删除评论失败', error: err.message }
  }
}
