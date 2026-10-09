// utils/draft.js —— 发帖草稿自动保存/恢复（本地存储）
// 机制：用户编辑中途退出（onHide/onUnload）时自动保存；再次进入发帖页时恢复未发布的草稿
const { DRAFT_KEY } = require('../config/index.js')

// 保存草稿到本地 storage
// draft = { title, content, category, is_anonymous, images, tags, savedAt }
function saveDraft(draft) {
  if (!draft) return
  // 至少要有标题或正文才算有内容，空草稿不保存
  if (!draft.title && !draft.content && (!draft.images || draft.images.length === 0)) {
    clearDraft()
    return
  }
  draft.savedAt = Date.now()
  wx.setStorageSync(DRAFT_KEY, draft)
}

// 读取草稿（不存在返回 null）
function getDraft() {
  return wx.getStorageSync(DRAFT_KEY) || null
}

// 清除草稿（发布成功后调用）
function clearDraft() {
  wx.removeStorageSync(DRAFT_KEY)
}

// 判断是否有未发布的草稿
function hasDraft() {
  return !!getDraft()
}

module.exports = { saveDraft, getDraft, clearDraft, hasDraft }
