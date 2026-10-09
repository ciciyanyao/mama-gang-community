// 云函数模板
// 使用方法：复制此文件，修改函数名和业务逻辑
// 适用于：B6热门榜、B7置顶帖等BF类任务

const cloud = require('wx-server-sdk');
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});
const db = cloud.database();
const _ = db.command;

// 常量定义
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const { action } = event;

  switch (action) {
    case 'action1':
      return await handleAction1(event, context, OPENID);
    case 'action2':
      return await handleAction2(event, context, OPENID);
    default:
      return {
        code: -1,
        message: '未知操作'
      };
  }
};

// 处理操作1
async function handleAction1(event, context, openid) {
  try {
    // 业务逻辑
    const result = await db.collection('collection_name')
      .where({
        _openid: openid
      })
      .get();

    return {
      code: 0,
      message: '操作成功',
      data: result.data
    };
  } catch (err) {
    return {
      code: -1,
      message: '操作失败',
      error: err.message
    };
  }
}

// 处理操作2
async function handleAction2(event, context, openid) {
  try {
    // 业务逻辑
    const result = await db.collection('collection_name')
      .add({
        data: {
          _openid: openid,
          create_time: db.serverDate(),
          // 其他字段
        }
      });

    return {
      code: 0,
      message: '添加成功',
      data: result
    };
  } catch (err) {
    return {
      code: -1,
      message: '添加失败',
      error: err.message
    };
  }
}

// 工具函数：分页查询
// 参数说明：
//   collection - 集合名称
//   query - 查询条件
//   page - 页码（从1开始）
//   pageSize - 每页数量（默认20，最大100）
//   orderBy - 排序字段（默认'create_time'）
//   order - 排序方式（默认'desc'）
async function paginatedQuery(collection, query, page, pageSize = DEFAULT_PAGE_SIZE, orderBy = 'create_time', order = 'desc') {
  // 参数验证
  page = Math.max(1, parseInt(page) || 1);
  pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(pageSize) || DEFAULT_PAGE_SIZE));

  const countResult = await db.collection(collection)
    .where(query)
    .count();

  const total = countResult.total;

  const result = await db.collection(collection)
    .where(query)
    .orderBy(orderBy, order)
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .get();

  return {
    list: result.data,
    total,
    page,
    pageSize,
    hasMore: page * pageSize < total,
    totalPages: Math.ceil(total / pageSize)
  };
}

// 工具函数：验证必填字段
// 参数说明：
//   data - 要验证的数据对象
//   fields - 必填字段数组，支持嵌套字段（如'user.name'）
// 返回：{ valid: boolean, message?: string }
function validateRequiredFields(data, fields) {
  const missing = [];

  fields.forEach(field => {
    const value = field.split('.').reduce((obj, key) => obj && obj[key], data);
    if (value === undefined || value === null || value === '') {
      missing.push(field);
    }
  });

  if (missing.length > 0) {
    return {
      valid: false,
      message: `缺少必填字段：${missing.join(', ')}`
    };
  }

  return {
    valid: true
  };
}

// 工具函数：统一错误响应
function errorResponse(message, code = -1, details = null) {
  const response = {
    code,
    message,
    timestamp: Date.now()
  };
  if (details) {
    response.details = details;
  }
  return response;
}

// 工具函数：统一成功响应
function successResponse(data = null, message = '操作成功') {
  const response = {
    code: 0,
    message,
    timestamp: Date.now()
  };
  if (data !== null) {
    response.data = data;
  }
  return response;
}

// 工具函数：记录操作日志
async function logOperation(collection, operation, userId, data = {}) {
  try {
    await db.collection(collection).add({
      data: {
        operation,
        userId,
        data,
        create_time: db.serverDate(),
        ip: cloud.getWXContext().CLIENTIP
      }
    });
  } catch (err) {
    console.error('记录操作日志失败', err);
  }
}
