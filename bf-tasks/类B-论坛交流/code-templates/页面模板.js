// 页面模板
// 使用方法：复制此文件，修改页面名称和业务逻辑
// 适用于：B6热门榜、B7置顶帖等BF类任务的页面

const app = getApp();

// 常量定义
const DEFAULT_PAGE_SIZE = 20;

Page({
  data: {
    // 数据列表
    list: [],
    // 分页参数
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    hasMore: true,
    loading: false,
    // 错误状态
    error: null,
    // 其他数据
    currentTab: 'all',
    // 搜索关键词
    keyword: ''
  },

  onLoad(options) {
    // 页面加载时执行
    this.loadData();
  },

  onShow() {
    // 页面显示时执行
    // 可以在这里刷新数据
  },

  onHide() {
    // 页面隐藏时执行
  },

  onUnload() {
    // 页面卸载时执行
  },

  // 下拉刷新
  onPullDownRefresh() {
    this.setData({
      page: 1,
      list: [],
      hasMore: true
    });
    this.loadData().then(() => {
      wx.stopPullDownRefresh();
    });
  },

  // 上拉加载更多
  onReachBottom() {
    this.loadData();
  },

  // 加载数据
  async loadData() {
    if (this.data.loading || !this.data.hasMore) return;

    this.setData({ loading: true });

    try {
      const res = await wx.cloud.callFunction({
        name: 'cloud_function_name',
        data: {
          action: 'list',
          page: this.data.page,
          pageSize: this.data.pageSize,
          // 其他参数
        }
      });

      if (res.result.code === 0) {
        const newList = res.result.data;
        this.setData({
          list: this.data.page === 1 ? newList : [...this.data.list, ...newList],
          hasMore: newList.length === this.data.pageSize,
          page: this.data.page + 1
        });
      } else {
        wx.showToast({
          title: res.result.message,
          icon: 'none'
        });
      }
    } catch (err) {
      console.error('加载数据失败', err);
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
    } finally {
      this.setData({ loading: false });
    }
  },

  // 切换标签
  onTabChange(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({
      currentTab: tab,
      page: 1,
      list: [],
      hasMore: true
    });
    this.loadData();
  },

  // 点击列表项
  onItemTap(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/detail/detail?id=${id}`
    });
  },

  // 搜索
  onSearch(e) {
    const keyword = e.detail.value;
    this.setData({
      keyword,
      page: 1,
      list: [],
      hasMore: true
    });
    this.loadData();
  },

  // 删除操作
  async onDelete(e) {
    const id = e.currentTarget.dataset.id;

    wx.showModal({
      title: '确认删除',
      content: '确定要删除吗？',
      success: async (res) => {
        if (res.confirm) {
          try {
            const result = await wx.cloud.callFunction({
              name: 'cloud_function_name',
              data: {
                action: 'delete',
                id
              }
            });

            if (result.result.code === 0) {
              wx.showToast({
                title: '删除成功',
                icon: 'success'
              });

              // 刷新列表
              this.setData({
                page: 1,
                list: [],
                hasMore: true
              });
              this.loadData();
            }
          } catch (err) {
            console.error('删除失败', err);
            wx.showToast({
              title: '删除失败',
              icon: 'none'
            });
          }
        }
      }
    });
  },

  // 分享
  onShareAppMessage() {
    return {
      title: '分享标题',
      path: '/pages/current/current'
    };
  }
});
