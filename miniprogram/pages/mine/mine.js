// pages/mine/mine.js —— 我的页（F3 个人中心）
const app = getApp()
const db = wx.cloud.database()
const { confirm, showError, showSuccess } = require('../../utils/util.js')

Page({
  data: {
    // 用户信息
    userInfo: null,
    hasUserInfo: false,
    // 菜单列表
    menuList: [
      { id: 'my-posts',     title: '我的帖子', icon: '📝', url: '/pages/my-posts/my-posts' },
      { id: 'my-favorites', title: '我的收藏', icon: '⭐', url: '/pages/my-favorites/my-favorites' },
      { id: 'admin',        title: '管理后台', icon: '🛡️', url: '/pages/admin/admin', adminOnly: true },
      { id: 'about',        title: '关于',     icon: 'ℹ️', url: '' }
    ],
    // 是否管理员（role === 2）
    isAdmin: false
  },

  onLoad() {
    this._loadUserInfo()
  },

  onShow() {
    // 自定义 tabBar：同步当前选中 tab
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 4 })
    }
    // 每次进入刷新用户信息
    this._loadUserInfo()
  },

  // ==================== 加载用户信息 ====================
  async _loadUserInfo() {
    // 优先从 globalData 读取
    if (app.globalData.userInfo) {
      this.setData({
        userInfo: app.globalData.userInfo,
        hasUserInfo: true
      })
    }

    // 尝试从云数据库读取最新信息
    try {
      const res = await wx.cloud.callFunction({ name: 'login' })
      const openid = res.result.openid

      const userRes = await db.collection('users')
        .where({ _openid: openid })
        .limit(1)
        .get()

      if (userRes.data.length > 0) {
        const user = userRes.data[0]
        const userInfo = {
          nickName: user.nickname || '妈妈岗用户',
          avatarUrl: user.avatar || '',
          role: user.role || 0
        }
        app.globalData.userInfo = userInfo
        app.globalData.openid = openid

        this.setData({
          userInfo,
          hasUserInfo: true,
          isAdmin: user.role === 2
        })
      }
    } catch (err) {
      console.error('[mine] 加载用户信息失败：', err)
    }
  },

  // ==================== 菜单点击 ====================
  onMenuTap(e) {
    const { url, id, adminonly } = e.currentTarget.dataset

    // 管理后台需要管理员权限
    if (adminonly === 'true' || adminonly === true) {
      if (!this.data.isAdmin) {
        showError('需要管理员权限')
        return
      }
    }

    // 关于页暂时用 toast 提示
    if (id === 'about') {
      wx.showModal({
        title: '关于妈妈岗社区',
        content: '妈妈岗社区 v1.0.0\n为宝妈群体打造的求职交流平台',
        showCancel: false
      })
      return
    }

    if (url) {
      wx.navigateTo({ url })
    }
  },

  // ==================== 退出登录 ====================
  async onLogout() {
    const confirmed = await confirm('提示', '确定要退出登录吗？')
    if (!confirmed) return

    // 清除全局用户信息
    app.globalData.userInfo = null
    app.globalData.openid = null

    this.setData({
      userInfo: null,
      hasUserInfo: false,
      isAdmin: false
    })

    showSuccess('已退出登录')
  }
})