// config/index.js —— 全局常量统一管理
// 约定：所有"会随环境/配置变化的值"都放这里，改一处生效，避免散落在各页面各文件
module.exports = {
  // 云开发环境 ID（云开发控制台 → 环境 → 环境 ID）
  CLOUD_ENV_ID: 'cloud1-d1gxqkgy5a1f2e31a',

  // 板块枚举（发帖时选择；树洞 = 情绪倾诉 + 匿名）
  CATEGORIES: [
    { value: '求职交流', label: '求职交流' },
    { value: '职场经验', label: '职场经验' },
    { value: '育儿互助', label: '育儿互助' },
    { value: '情绪倾诉', label: '情绪倾诉' },
    { value: '政策资讯', label: '政策资讯' }
  ],

  // 角色枚举
  ROLES: { MOM: 0, HR: 1, ADMIN: 2 },

  // 发帖图片/视频上限
  MAX_MEDIA_COUNT: 9,

  // 草稿本地存储 key
  DRAFT_KEY: 'publish_draft'
}
