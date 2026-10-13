// cloudfunctions/media/index.js —— 批量把 cloud:// fileID 换成临时 https URL
// 用途：前端直连数据库读到的数据里，如果有 cloud:// 图片，前端权限不够会裂图
// 通过这个云函数用管理员身份换临时 URL，绕过存储权限
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event) => {
  try {
    const { fileList = [] } = event
    if (!Array.isArray(fileList) || fileList.length === 0) {
      return { code: 0, data: {} }
    }
    // 去重
    const unique = [...new Set(fileList.filter(f => typeof f === 'string' && f.startsWith('cloud://')))]
    if (unique.length === 0) return { code: 0, data: {} }

    const res = await cloud.getTempFileURL({ fileList: unique })
    const map = {}
    ;(res.fileList || []).forEach(f => {
      if (f.fileID && f.tempFileURL) map[f.fileID] = f.tempFileURL
    })
    return { code: 0, data: map }
  } catch (e) {
    return { code: -1, error: e.message }
  }
}
