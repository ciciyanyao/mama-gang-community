// utils/image-url.js —— 云存储 fileID → 临时可访问 https 链接
// 背景：cloud:// 路径直接给 <image src> 在微信开发者工具渲染层不稳定（真机正常），
// 统一在数据加载后转成临时链接再渲染。临时链接默认 2 小时时效，仅渲染时转换，不落库。
const CLOUD_PREFIX = 'cloud://'

/**
 * 批量把云存储 fileID 转为临时链接
 * @param {string[]} fileList 可能是 fileID 的数组（含非云路径时原样保留）
 * @returns {Promise<{map: Object, errFileIDs: string[]}>}
 *          map: { fileID: tempURL }；转换失败的 fileID 进 errFileIDs
 */
async function resolveTempUrls(fileList) {
  const ids = (fileList || []).filter(id => id && typeof id === 'string' && id.startsWith(CLOUD_PREFIX))
  const result = { map: {}, errFileIDs: [] }
  if (ids.length === 0) return result

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
    console.error('[image-url] getTempFileURL 失败：', e)
  }
  return result
}

/**
 * 把一条记录的 images 字段（fileID 数组）原位替换为临时链接
 * @param {Object} record 含 images 数组的对象
 * @param {Object} urlMap resolveTempUrls 返回的 map
 */
function applyUrlMap(record, urlMap) {
  if (record && Array.isArray(record.images) && record.images.length) {
    record.images = record.images.map(id => (urlMap[id] || id))
  }
  return record
}

module.exports = { resolveTempUrls, applyUrlMap }
