// components/empty-state/index.js —— 空状态组件（全站复用）
// 用法：
//   页面 json：{"usingComponents": {"empty-state": "/components/empty-state/index"}}
//   wxml：<empty-state text="还没有帖子，来发第一条吧" cta="去发帖" bind:cta="onCtaTap" />
//   illustration 可选：leaf（默认）/case/comment，对应内置低饱和度温馨小图案
Component({
  properties: {
    text: { type: String, value: '暂无内容' },
    cta: { type: String, value: '' },
    illustration: { type: String, value: 'leaf' }
  },
  methods: {
    onCtaTap() {
      this.triggerEvent('cta')
    }
  }
})
