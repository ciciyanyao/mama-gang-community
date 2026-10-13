// utils/image-url.js —— 云存储 fileID → 临时可访问 https 链接
// 背景：
// 1. cloud:// 路径直接给 <image src> 在微信开发者工具渲染层不稳定（真机正常）
// 2. 云存储默认权限"仅创建者可读写"，前端直接调 getTempFileURL 对别人的文件会失败
// 策略：先前端换，失败的 fileID 自动调 media 云函数（管理员身份）兜底
const CLOUD_PREFIX = 'cloud://'

/**
 * 批量把云存储 fileID 转为临时链接
 * @param {string[]} fileList 可能是 fileID 的数组（含非云路径时原样保留）
 * @returns {Promise<{map: Object, errFileIDs: string[]}>}
 */
async function resolveTempUrls(fileList) {
  const ids = (fileList || []).filter(id => id && typeof id === 'string' && id.startsWith(CLOUD_PREFIX))
  const result = { map: {}, errFileIDs: [] }
  if (ids.length === 0) return result

  // 第一遍：前端直接换（创建者本人的文件会成功）
  try {
    const res = await wx.cloud.getTempFileURL({ fileList: ids })
    ;(res.fileList || []).forEach(item => {
      if (item.status === 0 && item.tempFileURL) {
        result.map[item.fileID] = item.tempFileURL
      } else {
        result.errFileIDs.push(item.fileID)
      }
    })
  } catch (e) {
    console.error('[image-url] 前端 getTempFileURL 失败：', e)
    result.errFileIDs.push(...ids)
  }

  // 第二遍：失败的 fileID 调 media 云函数（管理员身份，绕过存储权限）
  if (result.errFileIDs.length > 0) {
    try {
      const res = await wx.cloud.callFunction({
        name: 'media',
        data: { fileList: result.errFileIDs }
      })
      const cloudMap = (res.result && res.result.data) || {}
      Object.keys(cloudMap).forEach(fid => {
        result.map[fid] = cloudMap[fid]
      })
      // 云函数也换不了的才保留为错误
      result.errFileIDs = result.errFileIDs.filter(fid => !cloudMap[fid])
    } catch (e) {
      console.error('[image-url] media 云函数兜底失败：', e)
    }
  }

  return result
}

/**
 * 把一条记录的 images 字段（fileID 数组）原位替换为临时链接
 */
function applyUrlMap(record, urlMap) {
  if (record && Array.isArray(record.images) && record.images.length) {
    record.images = record.images.map(id => (urlMap[id] || id))
  }
  return record
}

module.exports = { resolveTempUrls, applyUrlMap }
