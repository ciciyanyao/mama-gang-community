// subpkg/treehole-detail/treehole-detail.js —— 树洞帖详情页
// 数据链路：treehole.detail（单条 + isOwner）
// 删除：右上角"···" → 操作菜单 → 二次确认 → treehole.delete（物理删除，仅本人）
const { relativeTime } = require('../../utils/util.js')

// 卡片随机背景图（与树洞主页共用同一组素材，展示层不入库）
const CARD_BACKGROUNDS = [
  '/pages/tree-hole/images/card1.png',
  '/pages/tree-hole/images/card2.png',
  '/pages/tree-hole/images/card3.png',
  '/pages/tree-hole/images/card4.png',
  '/pages/tree-hole/images/card5.png'
]
const DECO_POOL = ['🐻', '🥪', '🥗', '☁️', '⭐', '🍞', '🍃', '☀️']

Page({
  data: {
    treeholeId: '',
    post: null,
    isOwner: false,
    loading: true,
    bgImage: CARD_BACKGROUNDS[Math.floor(Math.random() * CARD_BACKGROUNDS.length)],
    deco1: DECO_POOL[Math.floor(Math.random() * DECO_POOL.length)],
    deco2: DECO_POOL[Math.floor(Math.random() * DECO_POOL.length)]
  },

  onLoad(options) {
    this.setData({ treeholeId: options.id || '' })
    this.loadDetail(options.id || '')
  },

  async loadDetail(id) {
    if (!id) {
      this.setData({ loading: false })
      return
    }
    try {
      const res = await wx.cloud.callFunction({
        name: 'treehole',
        data: { action: 'detail', id }
      })
      const r = res.result
      if (r && r.code === 0 && r.data) {
        const d = r.data
        this.setData({
          post: {
            nickname: d.nickname || 'Mummy',
            content: d.content || '',
            timeText: relativeTime(d.created_at),
            hugCount: d.hug_count || 0
          },
          isOwner: !!d.isOwner,
          loading: false
        })
      } else {
        this.setData({ post: null, loading: false })
      }
    } catch (err) {
      console.error('[treehole-detail] 加载失败：', err)
      this.setData({ loading: false })
      wx.showToast({ title: '加载失败，请重试', icon: 'none' })
    }
  },

  // ==================== 删除树洞帖（一键无痕，仅本人入口） ====================
  // 右上角"···" → 操作菜单 → 二次确认 → treehole 云函数物理删除
  onMoreTap() {
    wx.showActionSheet({
      itemList: ['删除树洞帖'],
      itemColor: '#E54848',
      success: () => this.confirmDelete()
    })
  },

  confirmDelete() {
    wx.showModal({
      title: '删除树洞帖',
      content: '删除后这条树洞帖将永久消失，且无法恢复。确定删除吗？',
      confirmText: '删除',
      confirmColor: '#E54848',
      cancelText: '取消',
      success: res => {
        if (res.confirm) this.doDelete()
      }
    })
  },

  async doDelete() {
    const { treeholeId } = this.data
    if (!treeholeId) return

    wx.showLoading({ title: '删除中...', mask: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'treehole',
        data: { action: 'delete', id: treeholeId }
      })
      wx.hideLoading()

      if (res.result && res.result.code === 0) {
        wx.showToast({ title: '已删除', icon: 'success' })
        setTimeout(() => wx.navigateBack(), 800)
      } else {
        wx.showToast({ title: (res.result && res.result.msg) || '删除失败', icon: 'none' })
      }
    } catch (err) {
      wx.hideLoading()
      console.error('[treehole-detail] 删除失败：', err)
      wx.showToast({ title: '删除失败，请重试', icon: 'none' })
    }
  }
})
