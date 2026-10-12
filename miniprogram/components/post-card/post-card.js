// components/post-card/post-card.js —— 帖子卡片组件
Component({
  properties: {
    // 帖子数据对象
    post: {
      type: Object,
      value: {}
    }
  },
  data: {
    // 默认匿名头像
    defaultAvatar: '/images/user-3-line.svg'
  },
  methods: {
    // 点击帖子卡片，跳转详情
    onTapCard() {
      const { _id } = this.properties.post
      if (_id) {
        wx.navigateTo({ url: `/pages/post-detail/post-detail?id=${_id}` })
      }
    },
    // 点赞/取消点赞
    onTapLike() {
      this.triggerEvent('like', { postId: this.properties.post._id })
    },
    // 评论
    onTapComment() {
      const { _id } = this.properties.post
      if (_id) {
        wx.navigateTo({ url: `/pages/post-detail/post-detail?id=${_id}` })
      }
    }
  }
})