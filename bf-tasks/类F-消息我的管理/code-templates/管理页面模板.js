// 管理页面模板
// 使用方法：复制此文件，修改业务逻辑

const app = getApp();

Page({
  data: {
    // 统计数据
    stats: {
      todayPosts: 0,
      todayComments: 0,
      pendingReports: 0,
      totalUsers: 0
    },
    // 举报列表
    reports: [],
    // 分页参数
    page: 1,
    pageSize: 20,
    hasMore: true,
    loading: false,
    // 当前标签
    currentTab: 'stats' // stats, reports
  },

  onLoad() {
    this.loadStats();
    this.loadReports();
  },

  onShow() {
    this.loadStats();
  },

  // 加载统计数据
  async loadStats() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'admin',
        data: {
          action: 'getAdminStats'
        }
      });

      if (res.result.code === 0) {
        this.setData({
          stats: res.result.data
        });
      }
    } catch (err) {
      console.error('获取统计数据失败', err);
    }
  },

  // 加载举报列表
  async loadReports() {
    if (this.data.loading || !this.data.hasMore) return;

    this.setData({ loading: true });

    try {
      const res = await wx.cloud.callFunction({
        name: 'admin',
        data: {
          action: 'getReportList',
          page: this.data.page,
          pageSize: this.data.pageSize,
          status: 1 // 只加载待处理的
        }
      });

      if (res.result.code === 0) {
        const newReports = res.result.data;
        this.setData({
          reports: this.data.page === 1 ? newReports : [...this.data.reports, ...newReports],
          hasMore: newReports.length === this.data.pageSize,
          page: this.data.page + 1
        });
      }
    } catch (err) {
      console.error('获取举报列表失败', err);
    } finally {
      this.setData({ loading: false });
    }
  },

  // 切换标签
  onTabChange(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({
      currentTab: tab
    });

    if (tab === 'reports' && this.data.reports.length === 0) {
      this.loadReports();
    }
  },

  // 处理举报
  async onHandleReport(e) {
    const { reportId, action } = e.currentTarget.dataset;

    wx.showModal({
      title: '确认处理',
      content: action === 'approve' ? '确定要批准举报并删除内容吗？' : '确定要驳回举报吗？',
      success: async (res) => {
        if (res.confirm) {
          try {
            const result = await wx.cloud.callFunction({
              name: 'admin',
              data: {
                action: 'handleReport',
                reportId,
                action
              }
            });

            if (result.result.code === 0) {
              wx.showToast({
                title: result.result.message,
                icon: 'success'
              });

              // 刷新列表
              this.setData({
                reports: [],
                page: 1,
                hasMore: true
              });
              this.loadReports();
              this.loadStats();
            } else {
              wx.showToast({
                title: result.result.message,
                icon: 'none'
              });
            }
          } catch (err) {
            console.error('处理举报失败', err);
            wx.showToast({
              title: '处理失败',
              icon: 'none'
            });
          }
        }
      }
    });
  },

  // 删除帖子
  async onDeletePost(e) {
    const postId = e.currentTarget.dataset.postId;

    wx.showModal({
      title: '确认删除',
      content: '确定要删除这个帖子吗？删除后无法恢复。',
      success: async (res) => {
        if (res.confirm) {
          try {
            const result = await wx.cloud.callFunction({
              name: 'admin',
              data: {
                action: 'deletePost',
                postId,
                reason: '管理员删除'
              }
            });

            if (result.result.code === 0) {
              wx.showToast({
                title: '删除成功',
                icon: 'success'
              });

              // 刷新列表
              this.setData({
                reports: [],
                page: 1,
                hasMore: true
              });
              this.loadReports();
              this.loadStats();
            }
          } catch (err) {
            console.error('删除帖子失败', err);
            wx.showToast({
              title: '删除失败',
              icon: 'none'
            });
          }
        }
      }
    });
  },

  // 删除评论
  async onDeleteComment(e) {
    const commentId = e.currentTarget.dataset.commentId;

    wx.showModal({
      title: '确认删除',
      content: '确定要删除这条评论吗？',
      success: async (res) => {
        if (res.confirm) {
          try {
            const result = await wx.cloud.callFunction({
              name: 'admin',
              data: {
                action: 'deleteComment',
                commentId,
                reason: '管理员删除'
              }
            });

            if (result.result.code === 0) {
              wx.showToast({
                title: '删除成功',
                icon: 'success'
              });
            }
          } catch (err) {
            console.error('删除评论失败', err);
            wx.showToast({
              title: '删除失败',
              icon: 'none'
            });
          }
        }
      }
    });
  },

  // 设置置顶
  async onSetTop(e) {
    const { postId, isTop } = e.currentTarget.dataset;

    try {
      const result = await wx.cloud.callFunction({
        name: 'admin',
        data: {
          action: 'setTop',
          postId,
          isTop: !isTop
        }
      });

      if (result.result.code === 0) {
        wx.showToast({
          title: result.result.message,
          icon: 'success'
        });
      }
    } catch (err) {
      console.error('设置置顶失败', err);
      wx.showToast({
        title: '操作失败',
        icon: 'none'
      });
    }
  },

  // 下拉刷新
  onPullDownRefresh() {
    this.setData({
      reports: [],
      page: 1,
      hasMore: true
    });
    this.loadReports().then(() => {
      wx.stopPullDownRefresh();
    });
  },

  // 上拉加载更多
  onReachBottom() {
    if (this.data.currentTab === 'reports') {
      this.loadReports();
    }
  }
});
