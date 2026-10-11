// components/loading/index.js —— 加载中组件（DailyBean 风格，干净简洁）
// 参考 DailyBean：暖米背景 + 绿色圆形 blob + 斜条纹进度条 + 双行文案
//
// 用法：
//   页面 json：{"usingComponents": {"loading": "/components/loading/index"}}
//
//   <loading title="加载中" subtitle="正在准备内容..." progress="45" />
//   <loading title="加载完成" status="success" />
//   <loading title="加载失败" status="error" bind:retry="onRetry" />
Component({
  properties: {
    title:    { type: String,  value: '加载中' },
    subtitle: { type: String,  value: '' },
    progress: { type: Number,  value: 0 },
    status:   { type: String,  value: 'loading' }   // loading / success / error
  },
  data: {
    progressPct: 0
  },
  observers: {
    progress(n) {
      this.setData({ progressPct: Math.max(0, Math.min(100, Math.round(n || 0))) })
    }
  },
  methods: {
    onRetry() { this.triggerEvent('retry') }
  }
})
