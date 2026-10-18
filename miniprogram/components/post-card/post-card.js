// components/post-card/post-card.js —— 帖子卡片组件
const { pickAnonymous, pickFallback } = require('../../utils/anonymous.js')
const { resolveTempUrls } = require('../../utils/image-url.js') // 统一云图转换：前端换 + media 云函数兜底

Component({
  properties: {
    // 帖子数据对象
    post: {
      type: Object,
      value: {},
      observer(newVal) {
        if (!newVal) return
        if (newVal.is_anonymous && newVal.anonymousId) {
          const id = pickAnonymous(newVal.anonymousId)
          this.setData({ anonAvatar: id.avatar, anonNickname: id.nickname })
        } else {
          this.setData({ anonAvatar: '', anonNickname: '' })
        }
        // 非匿名帖但作者信息缺失（历史数据/手工插入）：用匿名池随机兜底，不用"宝妈用户"旧兜底
        if (!newVal.is_anonymous && !newVal.authorName) {
          const fb = pickFallback()
          this.setData({ fallbackAvatar: fb.avatar, fallbackNickname: fb.nickname })
        }
        // cloud:// 图片不能直接渲染，转临时 https 链接
        this._resolveCloudUrls(newVal)
      }
    }
  },
  data: {
    // 默认匿名头像（兜底头像池，非匿名帖无作者头像时也用）
    defaultAvatar: '/images/anonymous/anon-1-sail.png',
    anonAvatar: '',
    anonNickname: '',
    fallbackAvatar: '/images/anonymous/anon-1-sail.png',
    fallbackNickname: '',
    // cloud:// 转换结果（用于渲染）
    avatarUrl: '',
    imageList: []
  },
  methods: {
    // 把 cloud:// 开头的头像与帖子图片批量转成临时 https 链接
    // 硬约束：转换失败的 cloud:// 条目绝不透传给渲染层（头像→默认头像，图片→不显示）
    _resolveCloudUrls(post) {
      const avatar = post.authorAvatar || ''
      const images = Array.isArray(post.images) ? post.images.slice(0, 3) : []

      const cloudUrls = []
      if (avatar.indexOf('cloud://') === 0) cloudUrls.push(avatar)
      images.forEach(img => {
        if (img && img.indexOf('cloud://') === 0 && cloudUrls.indexOf(img) < 0) cloudUrls.push(img)
      })

      // 无 cloud:// 图片，直接透传
      if (cloudUrls.length === 0) {
        this.setData({ avatarUrl: avatar, imageList: images })
        return
      }

      resolveTempUrls(cloudUrls)
        .then(({ map, errFileIDs }) => {
          const failSet = {}
          ;(errFileIDs || []).forEach(id => { failSet[id] = true })
          this.setData({
            avatarUrl: avatar.indexOf('cloud://') === 0
              ? (map[avatar] || '')
              : avatar,
            imageList: images.map(img => {
              if (img.indexOf('cloud://') === 0) return map[img] || ''
              return img
            }).filter(Boolean)
          })
        })
        .catch(err => {
          console.error('[post-card] 图片链接转换失败：', err)
          this.setData({
            avatarUrl: avatar.indexOf('cloud://') === 0 ? '' : avatar,
            imageList: images.filter(img => img.indexOf('cloud://') !== 0)
          })
        })
    },
    // 点击帖子卡片，跳转详情
    onTapCard() {
      const { _id } = this.properties.post
      if (_id) {
        wx.navigateTo({ url: `/subpkg/post-detail/post-detail?id=${_id}` })
      }
    },
    // 点赞/取消点赞
    onTapLike() {
      this.triggerEvent('like', { postId: this.properties.post._id })
    },
    // 收藏/取消收藏
    onTapFavorite() {
      this.triggerEvent('favorite', { postId: this.properties.post._id })
    },
    // 评论
    onTapComment() {
      const { _id } = this.properties.post
      if (_id) {
        wx.navigateTo({ url: `/subpkg/post-detail/post-detail?id=${_id}` })
      }
    }
  }
})
