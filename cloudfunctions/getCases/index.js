// cloudfunctions/getCases/index.js —— 案例库全量拉取
// 为什么需要它：小程序前端 get() 单次最多返回 20 条（limit 上限 20），
// 371 条案例没法靠前端分页拿到；云函数端是服务端 SDK（管理员权限），
// 不受前端 20 条限制、也不受集合权限设置限制，一次 limit(1000) 即可取全量。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async () => {
  const MAX = 1000
  let all = []
  for (let skip = 0; ; skip += MAX) {
    const res = await db.collection('cases').skip(skip).limit(MAX).get()
    all = all.concat(res.data)
    if (res.data.length < MAX) break
  }
  return {
    code: 0,
    list: all,
    total: all.length
  }
}
