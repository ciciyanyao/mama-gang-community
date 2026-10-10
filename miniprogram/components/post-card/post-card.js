// components/post-card/post-card.js
const { relativeTime } = require('../../utils/util.js')

Component({
  properties: {
    post: {
      type: Object,
      value: {}
    },
    showTopTag: {
      type: Boolean,
      value: true
    }
  },
  data: {
    timeText: ''
  },
  observers: {
    'post.create_time': function(time) {
      if (time) {
        this.setData({
          timeText: relativeTime(time)
        })
      }
    }
  },
  methods: {
    onTap() {
      this.triggerEvent('tap', { postId: this.data.post._id })
    },
    onLikeTap() {
      this.triggerEvent('like', { postId: this.data.post._id })
    }
  }
})