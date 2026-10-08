// 云函数模板
// 使用方法：复制此文件，修改函数名和业务逻辑

const cloud = require('wx-server-sdk');
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});
const db = cloud.database();
const _ = db.command;

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
async function paginatedQuery(collection, query, page, pageSize) {
  const countResult = await db.collection(collection)
    .where(query)
    .count();

  const total = countResult.total;

  const result = await db.collection(collection)
    .where(query)
    .orderBy('create_time', 'desc')
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .get();

  return {
    list: result.data,
    total,
    page,
    pageSize,
    hasMore: page * pageSize < total
  };
}

// 巤具函数：验证必填字段
function validateRequiredFields(data, fields) {
  const missing = [];

  fields.forEach(field => {
    if (!data[field] && data[field] !== 0) {
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
