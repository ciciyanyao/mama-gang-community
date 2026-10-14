// custom-tab-bar/index.js —— 自定义底部导航
// 设计：扁平绿系；选中 = 图标变绿 + 图标上方绿色短横线；中间"+" = 绿色圆形凸起按钮
// 角标：消息 tab 的数字角标（badge），通过 setBadge 方法动态更新
// 未读刷新：每次切换到任意 Tab 页（pageLifetimes.show）时查询 notify 云函数 checkUnread，
//           未读数 = 评论 + 点赞 + 收藏 + 关注 + 私信（与各消息源集合口径一致）；消息页自身管理清零
Component({
  data: {
    selected: 0,
    list: [
      { pagePath: '/pages/index/index',     text: '论坛', icon: '/images/blaze-line.svg',        activeIcon: '/images/blaze-line-active.svg' },
      { pagePath: '/pages/message/message', text: '消息', icon: '/images/message-2-line.svg',     activeIcon: '/images/message-2-line-active.svg', badge: 0 },
      { pagePath: '/pages/publish/publish', text: '发帖', isAdd: true },
      { pagePath: '/pages/tree-hole/tree-hole', text: '树洞', icon: '/images/leaf-line.svg',      activeIcon: '/images/leaf-line-active.svg' },
      { pagePath: '/pages/mine/mine',       text: '我的', icon: '/images/user-3-line.svg',        activeIcon: '/images/user-3-line-active.svg' }
    ]
  },
  pageLifetimes: {
    // 每次 Tab 页显示时刷新消息未读角标
    show() {
      this._refreshBadge()
    }
  },
  methods: {
    // 点击 tab 切换页面
    switchTab(e) {
      const path = e.currentTarget.dataset.path
      if (!path) return
      wx.switchTab({ url: path })
    },
    // 供页面 onShow 调用同步选中态：this.getTabBar().setData({ selected: N })
    setSelected(index) {
      this.setData({ selected: index })
    },
    // 设置消息 tab 角标数量（0 表示隐藏角标）
    setBadge(count) {
      const list = this.data.list
      list[1].badge = count
      this.setData({ list })
    },
    // 清除消息 tab 角标
    clearBadge() {
      this.setBadge(0)
    },
    // 查询未读数并刷新角标（消息页除外——消息页由自身管理已读与清零）
    async _refreshBadge() {
      const pages = getCurrentPages()
      const cur = pages[pages.length - 1]
      if (cur && cur.route === 'pages/message/message') return
      try {
        const res = await wx.cloud.callFunction({
          name: 'notify',
          data: { action: 'checkUnread' }
        })
        const d = res.result && res.result.data
        const count = (d && d.total) || 0
        this.setBadge(count)
      } catch (err) {
        console.error('[tabBar] 刷新未读失败', err)
      }
    }
  }
})
