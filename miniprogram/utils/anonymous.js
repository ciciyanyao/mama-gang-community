// utils/anonymous.js —— 匿名头像/昵称分配
// 规则（来自《匿名头像.md》）：
//   - 论坛用：6 个预设头像池，按 anonymousId 哈希取模
//   - 同一帖子内：同一用户的匿名评论保持同一头像/昵称（由 hash(openid+postId) 派生 anonymousId 保证）
//   - 跨帖子：postId 不同 → anonymousId 不同 → 头像昵称自动重洗
//   - 树洞：统一浅灰叶头像 + "Mummy"
const AVATARS = [
  '/images/anonymous/anon-1-sail.png',
  '/images/anonymous/anon-2-cloud.png',
  '/images/anonymous/anon-3-sprout.png',
  '/images/anonymous/anon-4-shell.png',
  '/images/anonymous/anon-5-star.png',
  '/images/anonymous/anon-6-leaf.png'
]

const NICKNAMES = [
  '好好吃顿饭', '简单就挺好', '捕捉小开心', '晚风没说话', '人间普通客',
  '午后有点闷', '日子有点沉', '安静喘口气', '倦了就歇会', '独自看街灯', '随日子浮沉'
]

// djb2 字符串 hash（与云函数保持同一算法，保证前后端选中结果一致）
function hash(str) {
  let h = 5381
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h + str.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

// 根据 anonymousId 取头像+昵称
function pickAnonymous(anonymousId) {
  if (!anonymousId) {
    return { avatar: AVATARS[0], nickname: NICKNAMES[0] }
  }
  const h = hash(String(anonymousId))
  return {
    avatar: AVATARS[h % AVATARS.length],
    nickname: NICKNAMES[h % NICKNAMES.length]
  }
}

// 树洞统一身份
function getTreeholeIdentity() {
  return {
    avatar: '/images/anonymous/anon-7-treehole.png',
    nickname: 'Mummy'
  }
}

// 无作者信息（authorName/authorAvatar 缺失）时的兜底身份：从匿名池随机挑，不再用"宝妈用户"等旧兜底
function pickFallback() {
  return {
    avatar: AVATARS[Math.floor(Math.random() * AVATARS.length)],
    nickname: NICKNAMES[Math.floor(Math.random() * NICKNAMES.length)]
  }
}

module.exports = { pickAnonymous, getTreeholeIdentity, pickFallback, hash }
