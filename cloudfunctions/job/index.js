// cloudfunctions/job/index.js —— 招聘岗位云函数（P2 可选）
// actions: list / detail
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

const PAGE_SIZE = 20

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  const { action } = event

  switch (action) {
    case 'list':
      return await handleList(event)
    case 'detail':
      return await handleDetail(event)
    default:
      return { code: -1, message: '未知操作' }
  }
}

/**
 * 获取岗位列表（分页）
 * 参数：page, pageSize, city(可选), type(可选：全职/弹性/计件)
 */
async function handleList(event) {
  try {
    const { page = 1, pageSize = PAGE_SIZE, city, type } = event
    const skip = (Math.max(1, parseInt(page)) - 1) * parseInt(pageSize)

    // 构建查询条件
    const where = {}
    if (city && city !== '全部') {
      where.city = city
    }
    if (type && type !== '全部') {
      where.type = type
    }

    const [countRes, listRes] = await Promise.all([
      db.collection('jobs').where(where).count(),
      db.collection('jobs')
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
    return { code: -1, message: '获取岗位列表失败', error: err.message }
  }
}

/**
 * 获取岗位详情
 * 参数：jobId
 */
async function handleDetail(event) {
  try {
    const { jobId } = event
    if (!jobId) {
      return { code: -1, message: '缺少岗位ID' }
    }

    const res = await db.collection('jobs').doc(jobId).get()

    return {
      code: 0,
      message: '获取成功',
      data: res.data
    }
  } catch (err) {
    return { code: -1, message: '获取岗位详情失败', error: err.message }
  }
}