// pages/mine/mine.js —— 我的页（F3 个人中心）
const app = getApp()
const auth = require('../../utils/auth.js')
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
    // 统一用 auth 判定登录：storage 有昵称才算已登录（与发帖等页面同一标准）
    if (!auth.isLogin()) {
      // 未登录：显示登录入口
      app.globalData.userInfo = null
      this.setData({ userInfo: null, hasUserInfo: false, isAdmin: false })
      return
    }

    // 已登录：先展示本地信息
    const local = auth.getUserInfo()
    const userInfo = {
      nickName: local.nickname || local.nickName || '妈妈岗用户',
      avatarUrl: local.avatar || local.avatarUrl || '',
      role: local.role || 0
    }
    app.globalData.userInfo = userInfo
    this.setData({ userInfo, hasUserInfo: true, isAdmin: userInfo.role === 2 })

    // 再从云端取最新（昵称/头像/角色可能被修改）
    try {
      const res = await wx.cloud.callFunction({ name: 'login', data: { action: 'getUserInfo' } })
      if (res.result && res.result.code === 0) {
        const user = res.result.data
        const fresh = {
          nickName: user.nickname || userInfo.nickName,
          avatarUrl: user.avatar || userInfo.avatarUrl,
          role: user.role || 0
        }
        app.globalData.userInfo = fresh
        this.setData({ userInfo: fresh, isAdmin: user.role === 2 })
      }
    } catch (err) {
      console.error('[mine] 加载用户信息失败：', err)
    }
  },

  // ==================== 未登录点击 → 登录弹窗 ====================
  onLoginTap() {
    const modal = this.selectComponent('#loginModal')
    if (modal) modal.show()
  },

  // 登录成功回调：刷新个人信息
  onLoginSuccess() {
    this._loadUserInfo()
    wx.showToast({ title: '登录成功', icon: 'success' })
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

    // 统一清除登录态（storage + globalData）
    auth.clearUserInfo()

    this.setData({
      userInfo: null,
      hasUserInfo: false,
      isAdmin: false
    })

    showSuccess('已退出登录')
  }
})