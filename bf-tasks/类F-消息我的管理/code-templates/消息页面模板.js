// 消息页面模板
// 使用方法：复制此文件，修改业务逻辑

const app = getApp();

Page({
  data: {
    // 消息列表
    messageList: [],
    // 分页参数
    page: 1,
    pageSize: 20,
    hasMore: true,
    loading: false,
    // 未读状态
    hasUnread: false
  },

  onLoad() {
    this.loadMessages();
    this.checkUnreadMessages();
  },

  onShow() {
    // 每次显示页面时检查未读消息
    this.checkUnreadMessages();
  },

  // 加载消息列表
  async loadMessages() {
    if (this.data.loading || !this.data.hasMore) return;

    this.setData({ loading: true });

    try {
      const res = await wx.cloud.callFunction({
        name: 'message',
        data: {
          action: 'list',
          page: this.data.page,
          pageSize: this.data.pageSize
        }
      });

      if (res.result.code === 0) {
        const newMessages = res.result.data;
        this.setData({
          messageList: this.data.page === 1 ? newMessages : [...this.data.messageList, ...newMessages],
          hasMore: newMessages.length === this.data.pageSize,
          page: this.data.page + 1
        });
      }
    } catch (err) {
      console.error('获取消息失败', err);
      wx.showToast({
        title: '获取消息失败',
        icon: 'none'
      });
    } finally {
      this.setData({ loading: false });
    }
  },

  // 检查未读消息
  async checkUnreadMessages() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'message',
        data: {
          action: 'checkUnread'
        }
      });

      if (res.result.code === 0) {
        const hasUnread = res.result.data.hasUnread;
        this.setData({ hasUnread });

        // 更新TabBar红点
        if (hasUnread) {
          wx.showTabBarRedDot({
            index: 1 // 消息页的索引
          });
        } else {
          wx.hideTabBarRedDot({
            index: 1
          });
        }
      }
    } catch (err) {
      console.error('检查未读消息失败', err);
    }
  },

  // 标记消息为已读
  async markMessagesAsRead() {
    try {
      await wx.cloud.callFunction({
        name: 'message',
        data: {
          action: 'markRead'
        }
      });

      // 隐藏红点
      wx.hideTabBarRedDot({
        index: 1
      });

      this.setData({ hasUnread: false });
    } catch (err) {
      console.error('标记已读失败', err);
    }
  },

  // 下拉刷新
  onPullDownRefresh() {
    this.setData({
      page: 1,
      messageList: [],
      hasMore: true
    });
    this.loadMessages().then(() => {
      wx.stopPullDownRefresh();
    });
  },

  // 上拉加载更多
  onReachBottom() {
    this.loadMessages();
  },

  // 点击消息
  onMessageTap(e) {
    const { postId, messageId } = e.currentTarget.dataset;

    // 标记单条消息为已读
    this.markMessageAsRead(messageId);

    // 跳转到详情页
    wx.navigateTo({
      url: `/pages/post-detail/post-detail?id=${postId}`
    });
  },

  // 标记单条消息为已读
  async markMessageAsRead(messageId) {
    try {
      await wx.cloud.callFunction({
        name: 'message',
        data: {
          action: 'markOneRead',
          messageId
        }
      });
    } catch (err) {
      console.error('标记消息已读失败', err);
    }
  },

  // 删除消息
  async onDeleteMessage(e) {
    const messageId = e.currentTarget.dataset.messageId;

    wx.showModal({
      title: '确认删除',
      content: '确定要删除这条消息吗？',
      success: async (res) => {
        if (res.confirm) {
          try {
            const result = await wx.cloud.callFunction({
              name: 'message',
              data: {
                action: 'delete',
                messageId
              }
            });

            if (result.result.code === 0) {
              // 从列表中移除
              const messageList = this.data.messageList.filter(msg => msg._id !== messageId);
              this.setData({ messageList });

              wx.showToast({
                title: '删除成功',
                icon: 'success'
              });
            }
          } catch (err) {
            console.error('删除消息失败', err);
            wx.showToast({
              title: '删除失败',
              icon: 'none'
            });
          }
        }
      }
    });
  },

  // 清空所有消息
  async onClearAll() {
    wx.showModal({
      title: '确认清空',
      content: '确定要清空所有消息吗？',
      success: async (res) => {
        if (res.confirm) {
          try {
            const result = await wx.cloud.callFunction({
              name: 'message',
              data: {
                action: 'clearAll'
              }
            });

            if (result.result.code === 0) {
              this.setData({
                messageList: [],
                hasUnread: false
              });

              wx.hideTabBarRedDot({
                index: 1
              });

              wx.showToast({
                title: '清空成功',
                icon: 'success'
              });
            }
          } catch (err) {
            console.error('清空消息失败', err);
            wx.showToast({
              title: '清空失败',
              icon: 'none'
            });
          }
        }
      }
    });
  }
});
