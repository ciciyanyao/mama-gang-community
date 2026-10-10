// custom-tab-bar/index.js —— 自定义底部导航
// 设计：扁平绿系；选中 = 图标变绿 + 图标上方绿色短横线；中间"+" = 绿色圆形凸起按钮
// 角标：消息 tab 的数字角标（badge），当前写死测试值 3；
//       F1 消息功能完成后，改为从云函数读取未读数（见《需求开发文档》F1/F2）
Component({
  data: {
    selected: 0,
    list: [
      { pagePath: '/pages/index/index',     text: '论坛', icon: '/images/blaze-line.svg',        activeIcon: '/images/blaze-line-active.svg' },
      { pagePath: '/pages/message/message', text: '消息', icon: '/images/message-2-line.svg',     activeIcon: '/images/message-2-line-active.svg', badge: 3 },
      { pagePath: '/pages/publish/publish', text: '发帖', isAdd: true },
      { pagePath: '/pages/tree-hole/tree-hole', text: '树洞', icon: '/images/leaf-line.svg',      activeIcon: '/images/leaf-line-active.svg' },
      { pagePath: '/pages/mine/mine',       text: '我的', icon: '/images/user-3-line.svg',        activeIcon: '/images/user-3-line-active.svg' }
    ]
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
    }
  }
})
