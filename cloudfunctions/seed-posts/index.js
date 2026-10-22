// cloudfunctions/seed-posts/index.js
// 种子数据：模拟账号 + 妈妈岗劳动权益主题帖子 + 点赞 + 评论
// 两种用法（控制台测试运行传参）：
//   1) 默认（不传 action 或 action='seed'）：写入账号/帖子/点赞/评论（幂等，已执行过则跳过）
//   2) action='topup'：给评论不足 3 条的帖子补评论（模拟账号 + 通用文案池），并同步 commentCount
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const DAY = 86400000

// ============ 模拟账号（头像用小程序本地资源，人人可见） ============
const USERS = [
  { openid: 'seed_openid_001', nickname: '小夏', avatar: '/images/avatars/avatar-1-xia.png' },
  { openid: 'seed_openid_002', nickname: '林姐', avatar: '/images/avatars/avatar-2-lin.png' },
  { openid: 'seed_openid_003', nickname: '二胎妈妈', avatar: '/images/avatars/avatar-3-ertai.png' },
  { openid: 'seed_openid_004', nickname: '桃子', avatar: '/images/avatars/avatar-4-tao.png' },
  { openid: 'seed_openid_005', nickname: '团团', avatar: '/images/avatars/avatar-5-tui.png' },
  { openid: 'seed_openid_006', nickname: '郭姐', avatar: '/images/avatars/avatar-6-guo.png' },
  { openid: 'seed_openid_007', nickname: '曼曼', avatar: '/images/avatars/avatar-7-man.png' },
  { openid: 'seed_openid_008', nickname: '玲玲', avatar: '/images/avatars/avatar-8-ling.png' },
  { openid: 'seed_openid_009', nickname: '娜娜', avatar: '/images/avatars/avatar-9-na.png' },
  { openid: 'seed_openid_010', nickname: '娟娟', avatar: '/images/avatars/avatar-10-juan.png' }
]

// ============ 帖子（政策事实已按广东官方口径核实） ============
// offsetDay：距当前时间的天数（负数=过去），用于分散 create_time
// likeCount：与下方点赞记录条数一致；comments：评论数组
const POSTS = [
  {
    title: '广东产假到底多少天？98+80=178，别再被HR忽悠了',
    category: '政策资讯',
    offsetDay: -1,
    likeCount: 42,
    content: `姐妹们！被HR口头承诺"产假只有98天"的请举手🙋\n\n广东的法定组合是：98天基础产假 + 80天奖励假 = 178天！难产再加30天，多胞胎每多一个宝宝加15天，还有15天产前假可以提前休。\n\n我当时休完178天回公司，还遇到同事问"你怎么休这么久"……拜托，这是法律给的！\n\n【划重点】产假期间工资照发，生育津贴和工资就高不就低，公司不能以"休产假"为由扣钱。建议把《广东省人口与计划生育条例》第三十条截图存手机，HR再忽悠你就甩给她看。`,
    comments: [
      { author: 7, content: '第一次知道还有80天奖励假，之前公司只让我休98天，血亏😭' },
      { author: 6, content: '补充一句，产检假也是带薪的，孕期每月还有产检时间，别傻傻扣年假去产检' },
      { author: 8, content: '178天休完回来差点找不到工位…但法律就是法律，姐妹们别怂' },
      { author: 9, content: '收藏了，正好备孕，到时候直接甩给HR' }
    ]
  },
  {
    title: '生育津贴怎么算？手把手教你算出自己能领多少',
    category: '政策资讯',
    offsetDay: -2,
    likeCount: 38,
    content: `很多姐妹生完才知道生育津贴能领一笔不小的钱，但算不明白，今天一次性说清👇\n\n计算公式：生育津贴 = 单位上年度职工月平均工资 ÷ 30 × 你的产假天数\n\n举个例子：单位月平均工资8000，产假178天 → 8000÷30×178 ≈ 4.7万\n\n注意！是按【单位平均工资】算，不是按你个人工资！如果单位平均工资比你高，你反而赚了。\n\n生育津贴和产假工资"就高不就低"，公司不能两头都扣。\n\n【实操】顺产/难产天数不同，津贴跟着变；生完拿着出院小结、出生证明去医保局或线上申请就行，广东大部分城市全程网办。`,
    comments: [
      { author: 3, content: '我们公司平均工资比我高，休完产假直接多拿1万+，真香' },
      { author: 1, content: '提醒一下，灵活就业/失业期间生育的津贴算法不一样，别套错公式' },
      { author: 5, content: '生娃前一定先问HR要社保缴费基数，很多公司按最低基数交，津贴差好远' }
    ]
  },
  {
    title: '妈妈岗有补贴？！中山企业每月领400，员工还能领300社保补贴',
    category: '政策资讯',
    offsetDay: -3,
    likeCount: 26,
    content: `姐妹们，中山"妈妈岗"政策真的来钱！\n\n2022年中山全国首发"妈妈岗"1.0政策，企业招养12周岁以下孩子的妈妈，政府每月补贴企业400元/人，员工自己每月还有300元灵活就业社保补贴。\n\n也就是说：企业愿意招你 = 每月白拿400；你干着弹性工作 = 社保还有补贴兜底。\n\n岗位类型：客服、销售、配送、普工、课程顾问……主打一个"时间灵活、能接送娃"。\n\n现在珠海也跟上搞"妈妈岗"就业基地了，最高奖补30万。政策红利期，姐妹们赶紧研究自己城市有没有！`,
    comments: [
      { author: 10, content: '东莞有没有这个政策啊？同求！' },
      { author: 4, content: '我们厂就是妈妈岗，但HR从没提过补贴的事，这钱是不是被公司吃了？' }
    ]
  },
  {
    title: '哺乳假+育儿假：每天1小时哺乳时间，3岁前每年10天育儿假',
    category: '政策资讯',
    offsetDay: -1.5,
    likeCount: 31,
    content: `当妈才知道"假期"多值钱，但这两项很多人根本没用过👇\n\n【哺乳假】宝宝1岁内，每天有1小时哺乳时间，多胞胎每多一个宝宝加1小时。可以拆开用，比如晚到半小时+早走半小时。\n\n【育儿假】孩子3周岁前，父母每年各10天！是"每年"！不是总共10天！爸爸也有！\n\n广东省明确：育儿假不扣工资，休完还能正常拿全勤（有些公司想用年假抵，不行，这是两回事）。\n\n【划重点】这些假单位必须批，不批就是违法。留好聊天记录，真到了仲裁那天都是证据。`,
    comments: [
      { author: 7, content: '育儿假爸爸也能休？我老公公司说没有，我直接把文件甩给他老板了' },
      { author: 9, content: '哺乳时间我们公司让拿年假抵，看了这篇才知道违法，明天就去人事部' },
      { author: 2, content: '建议把这条转给每一个刚当妈的姐妹，太实用了' }
    ]
  },
  {
    title: '珠海妈妈岗就业基地最高奖补30万，就业政策在往哪走',
    category: '政策资讯',
    offsetDay: -4,
    likeCount: 22,
    content: `最近刷到珠海政策，妈妈岗就业基地认定后最高奖补30万！\n\n这说明什么？说明"妈妈岗"从企业自发，变成政府真金白银在推了。\n\n回顾一下时间线：\n2022 中山首发妈妈岗1.0（弹性工作+补贴）\n2023 珠三角片区跟进，企业招人给补贴\n2024 珠海市级"妈妈岗"就业基地，奖补30万\n\n政策越推越密，对咱们宝妈来说就是机会越来越多。多留意本地人社局的官网和公众号，政策都是那边首发。`,
    comments: [
      { author: 6, content: '坐标珠海，已经看到招聘会在推妈妈岗专场了，下周去看看' },
      { author: 5, content: '希望广东21个市全部铺开，别光羡慕中山珠海' }
    ]
  },
  {
    title: '产假期间被调岗降薪？违法红线一次说清',
    category: '政策资讯',
    offsetDay: -2,
    likeCount: 35,
    content: `刚刷到一个帖子，宝妈休完产假回去，岗位没了、工资降了，气到发抖。今天就说说这些红线👇\n\n❌ 降薪：产假期间/哺乳期内单方面降薪 → 违法\n❌ 调岗：未经协商把孕哺期员工调去重体力/夜班岗 → 违法\n❌ 边缘化：用"不胜任"为由逼退孕哺期员工 → 违法\n\n法律依据：《女职工劳动保护特别规定》《劳动合同法》第42条，孕、产、哺乳期内用人单位不得随意解除劳动合同。\n\n【怎么办】先协商 → 保留证据（聊天记录/工资条/录音）→ 劳动仲裁免费 → 妈妈岗姐妹别怕，该维权就维权，仲裁不收费！`,
    comments: [
      { author: 8, content: '去年被调岗没敢吭声，现在想想该直接仲裁的' },
      { author: 4, content: '仲裁不收费这点很多人不知道，我邻居就是仲裁拿回赔偿的' },
      { author: 3, content: '收藏了，万一遇到直接翻出来' }
    ]
  },
  {
    title: '妈妈岗干了两年，早送晚接钱少一点，但时间真的值',
    category: '职场经验',
    offsetDay: -5,
    likeCount: 29,
    content: `做妈妈岗两年了，简单说说真实感受。\n\n早8:30上班，下午4:30下班，中间还能请假去接娃开家长会。工资确实比同岗位全职低一些，但对我来说，能每天接送孩子、周末双休，这个"差价"是拿钱买不来的。\n\n同事基本都是妈妈，大家互相理解，老板也默认你随时可能请假——这种职场宽容度，全职岗真的给不了。\n\n【缺点也直说】晋升通道基本没有、收入天花板低、社保有的公司按最低基数交。但作为"过渡期"和"重返职场第一步"，我觉得值。`,
    comments: [
      { author: 10, content: '同感！工资少点但能接送娃，值' },
      { author: 1, content: '请问你们公司妈妈岗和全职岗差距大概多少？' }
    ]
  },
  {
    title: '谈offer一定要问清这3个"弹性"边界，血泪教训',
    category: '职场经验',
    offsetDay: -1,
    likeCount: 33,
    content: `姐妹们，妈妈岗的"弹性"如果不在入职前问清楚，入职后就是一场灾难。\n\n我面试时只问了"是不是弹性工作"，对方说"是"，结果入职后才知道：\n\n❌ 弹性≠想几点来就几点来，是"固定弹性"：早9晚5改成早10晚6，一样卡死\n❌ 弹性≠可以随时请假，是"弹性调休"：请假要先用加班时间抵\n❌ 弹性≠居家办公，是"弹性加班"：在家=7×24在线\n\n【入职前一定问清】\n1. 上下班时间弹性范围是多少？\n2. 请假/调休怎么算？\n3. 社保按什么基数交？是否全额？\n\n问清这三条再签合同，别像我一样入职三个月才看清。`,
    comments: [
      { author: 9, content: '第一条太真实了，弹性就是个幌子' },
      { author: 2, content: '补充，还要问"育儿假/哺乳假休不休"，很多妈妈岗HR闭口不谈' }
    ]
  },
  {
    title: '全职三年重返职场，我的时间表是这么排的',
    category: '职场经验',
    offsetDay: -6,
    likeCount: 24,
    content: `全职带娃三年，重新出来找工作，说说我的节奏。\n\n第1个月：盘点技能+列目标岗位，把"妈妈"经历翻译成简历语言（项目管理、多任务处理、危机公关😄）\n第2个月：海投+定向投结合，每天投10-20家，记录每家反馈，复盘话术\n第3个月：面试，前期拿几家练手，中期开始挑"弹性工作"的岗位\n第4个月：入职妈妈岗，从最基础做起，先把手感找回来\n\n【心得】别觉得全职三年是空白期，你带娃的每一天都是"实战经验"。面试时大大方方讲，自信才是第一生产力。`,
    comments: [
      { author: 7, content: '第1个月"翻译简历"真的有用，我就是这么干的' },
      { author: 4, content: '全职妈妈重返职场最怕的是自己先怯场，楼主说得对' }
    ]
  },
  {
    title: '在家办公两年被"边缘化"？我的自救实操',
    category: '职场经验',
    offsetDay: -3,
    likeCount: 27,
    content: `居家办公两年，最深的坑不是效率，是"存在感"。\n\n去年我发现：项目群里@我越来越少、老板安排重要活默认跳过、年会合影没我……被边缘化了。\n\n我的自救清单：\n1. 固定每周主动汇报：把周报写详细，让老板知道你干了什么\n2. 重要会议提前抢"发言位"：线上会议主动承担记录、总结\n3. 每季度约一次1对1：直接问"我今年的目标是什么"，把主动权拿回来\n4. 定期回办公室"刷脸"：哪怕一周一天，让同事记得你\n\n【法律提醒】如果公司以"长期未到岗"为由想动你，先看合同里怎么写的居家办公条款——留证据，别慌。`,
    comments: [
      { author: 6, content: '每周主动汇报这条救我大命，被看见才有机会' },
      { author: 8, content: '居家办公姐妹都懂，边缘化是温水煮青蛙' }
    ]
  },
  {
    title: '宝妈群里的"副业"别乱碰，说说我踩过的坑',
    category: '职场经验',
    offsetDay: -7,
    likeCount: 18,
    content: `全职那两年，在宝妈群里看到各种"副业"广告，说说我踩过的坑：\n\n❌ 刷单返利：先垫钱后返现，垫进去就拿不回来，报警都没用\n❌ 配音/剪辑培训：交几千学费，承诺接单，最后单子都是自己人\n❌ 微商囤货：压货压到怀疑人生\n\n【我的建议】\n1. 凡是让你先交钱的"副业"，一律当骗子处理\n2. 靠技能赚钱：会打字就做文案兼职，会算账就帮小商户做账，从自己会的开始\n3. 正规渠道：本地妇联、人社局的免费技能培训，还发补贴\n\n赚钱重要，但别让骗子把老本都骗走。`,
    comments: [
      { author: 5, content: '刷单那个太经典了，群里天天有人发' },
      { author: 4, content: '妇联的免费培训真的不错，我上过育婴课，还拿证了' }
    ]
  },
  {
    title: '面试被问"孩子谁带"？3个话术把主动权拿回来',
    category: '求职交流',
    offsetDay: -1,
    likeCount: 30,
    content: `"孩子还小吧？谁带啊？"——宝妈面试几乎必被问，怎么答？\n\n❌ 别撒谎说"有人带不用操心"（入职后打脸）\n❌ 别抱怨"婆婆不帮忙"（显得你生活一团乱）\n\n✅ 话术1：强调分工明确——"工作日由XX负责接送，周末我全程带，时间和工作不冲突"\n✅ 话术2：反客为主聊规划——"我重新出来工作就是想把职业规划做起来，家庭分工已经安排好了"\n✅ 话术3：把话题拉回岗位——"我更想聊聊我能为这份工作带来什么"\n\n【划重点】这类问题本质是担心你"随时请假"，你要展示的是"你有稳定的支持系统+你重视这份工作"。`,
    comments: [
      { author: 9, content: '话术2好用！面试官马上不纠结孩子的事了' },
      { author: 3, content: '被问过"二胎会不会马上三胎"，真无语，但话术3确实能救场' }
    ]
  },
  {
    title: '妈妈岗去哪找？人社官网+专场招聘会+这3个渠道',
    category: '求职交流',
    offsetDay: -4,
    likeCount: 21,
    content: `姐妹们问最多的就是"妈妈岗到底在哪投"，整理一下我找岗的渠道👇\n\n1. 本地人社局官网/公众号：政策首发地，经常有妈妈岗专区、专场招聘会\n2. 工会/妇联组织：很多城市妇联联合企业搞"宝妈就业帮扶"，登记过会主动推岗\n3. 招聘平台筛选：BOSS、58同城搜"妈妈岗""宝妈""弹性工作"，但注意辨别，凡是先交钱的都是骗子\n4. 线下社区/街道办：很多妈妈岗是社区就业服务站推的，直接去问最实在\n5. 企业直聘：做客服、配送、商超的企业很多有内部妈妈岗，主动投递试试\n\n【提醒】看到岗位先查企业资质，劳动合同一定要签，口头承诺都不算数。`,
    comments: [
      { author: 2, content: '社区就业服务站真的有用！我妈就是在社区登记的，很快有岗位推' },
      { author: 10, content: 'BOSS上搜"妈妈岗"岗位比想象中多，姐妹们冲' }
    ]
  },
  {
    title: '签合同前看清这6条！工时、社保、加班费一个都别漏',
    category: '求职交流',
    offsetDay: -2,
    likeCount: 28,
    content: `妈妈岗签合同，别只盯着工资数字，这6条必须逐字看👇\n\n1. 工时制度：标准工时/综合工时/不定时，不同制度加班费算法完全不同\n2. 社保基数：按实际工资还是最低基数交？直接影响你的生育津贴！\n3. 加班费：工作日1.5倍、休息日2倍、法定节假日3倍，白纸黑字写清楚\n4. 试用期：合同期限决定试用期上限，妈妈岗常见"试用期不交社保"是违法的\n5. 请假制度：婚假、产假、育儿假、哺乳时间怎么休，别等用的时候才发现没有\n6. 解除条件：什么情况下公司可以解除合同，越模糊越危险\n\n【划重点】签合同前把第2条问死——社保基数，它直接决定你生娃能领多少生育津贴！`,
    comments: [
      { author: 6, content: '第2条太关键了，很多妈妈岗按最低基数交，津贴差好几千' },
      { author: 7, content: '保存了，下次换工作前逐条对照' }
    ]
  },
  {
    title: '客服、课程顾问、配送、普工…宝妈转行哪条路更合适',
    category: '求职交流',
    offsetDay: -5,
    likeCount: 25,
    content: `妈妈岗最常见的几类岗位，说说我的观察：\n\n【客服】入门门槛低、可居家/轮班、但情绪消耗大，适合能扛住"被骂"的姐妹\n【课程顾问】教育机构妈妈岗多，底薪+提成，时间相对弹性，但业绩压力大\n【配送】时间自由、多劳多得，但风吹日晒、收入不稳定，体力要求高\n【普工】工厂妈妈岗稳定、有班车，但流水线节奏固定，请假难\n\n【我的建议】\n- 想稳定：普工/客服\n- 想时间自由：配送/线上客服\n- 有销售天赋：课程顾问\n\n先想清楚自己最不能妥协的是什么（接送时间？收入？成长？），再选，别跟风。`,
    comments: [
      { author: 5, content: '课程顾问干了半年，业绩压力真的劝退，但时间确实灵活' },
      { author: 9, content: '配送其实挺适合我这种闲不住的，就是夏天太晒了' }
    ]
  }
]

// ============ topup：补评论用的通用文案池（小红书风格，不与已有评论重复） ============
const TOPUP_COMMENTS = [
  '这个必须顶上去，太多姐妹不知道了',
  '收藏了，转给身边的宝妈姐妹看看',
  '终于有人把这件事说清楚了，之前一直迷迷糊糊的',
  '蹲一个后续，楼主多更新呀',
  '说得太真实了，看得我眼眶一热',
  '我们公司好像也是这样的，难怪总觉得哪里不对',
  '请问可以转载到我们宝妈群吗？太实用了',
  '已截图保存，谢谢楼主分享',
  '姐妹们有没有类似经历的，评论区抱团取暖',
  '刚经历完，早点看到这条就好了',
  '好文，建议置顶让更多人看到',
  '楼主写得好详细，用心了',
  '这个信息很及时，正好在考虑这个问题',
  '我们这边政策好像不太一样，有知道的姐妹吗',
  '顶顶顶，不能让这种干货沉下去',
  '被戳中了，说的就是我本人',
  '看完立刻去查了本地政策，居然真的有',
  '感谢分享，已经发给一起上班的宝妈了',
  '平时只看帖不评论，这条值得我冒个泡',
  '姐妹们别光收藏，点点赞让更多人看到呀'
]

// ============ topup：给评论不足 3 条的帖子补评论 ============
async function topupComments() {
  const postsRes = await db.collection('posts').where({ status: 1 }).limit(1000).get()
  const posts = postsRes.data
  let fixedCount = 0
  let addedTotal = 0
  const usedIdx = new Set()

  for (const p of posts) {
    const cntRes = await db.collection('comments').where({ postId: p._id, status: _.neq(-1) }).count()
    const current = cntRes.total
    if (current >= 3) continue

    const need = 3 - current
    const tasks = []
    for (let i = 0; i < need; i++) {
      let idx = Math.floor(Math.random() * TOPUP_COMMENTS.length)
      let guard = 0
      while (usedIdx.has(idx) && usedIdx.size < TOPUP_COMMENTS.length && guard < 20) {
        idx = (idx + 1) % TOPUP_COMMENTS.length
        guard++
      }
      usedIdx.add(idx)
      const u = USERS[Math.floor(Math.random() * USERS.length)]
      tasks.push(
        db.collection('comments').add({
          data: {
            postId: p._id,
            content: TOPUP_COMMENTS[idx],
            authorId: u.openid,
            authorName: u.nickname,
            authorAvatar: u.avatar,
            is_anonymous: false,
            status: 1,
            create_time: new Date(Date.now() - Math.floor(Math.random() * 24) * 3600000)
          }
        })
      )
    }
    for (let i = 0; i < tasks.length; i += 5) {
      await Promise.all(tasks.slice(i, i + 5))
    }
    if (need > 0) {
      await db.collection('posts').doc(p._id).update({ data: { commentCount: _.inc(need) } })
      fixedCount++
      addedTotal += need
    }
  }

  return {
    code: 0,
    msg: `共检查 ${posts.length} 条帖子：${fixedCount} 条帖子补充了评论，共新增 ${addedTotal} 条评论（每条帖子评论数已补齐至 3 条）`
  }
}

exports.main = async (event) => {
  // action='topup'：给评论不足 3 条的帖子补评论（模拟账号 + 通用小红书风格文案池）
  const action = (event && event.action) || 'seed'
  if (action === 'topup') {
    return await topupComments()
  }

  // 幂等：第一条帖子标题已存在 → 跳过
  const exist = await db.collection('posts').where({ title: POSTS[0].title }).count()
  if (exist.total > 0) {
    return { code: -1, msg: '已执行过种子数据（发现同名帖子），如需重置请先在控制台清空 posts 再重跑' }
  }

  // 1. 写入模拟账号（幂等：openid 已存在则跳过）
  const userMap = {}
  for (const u of USERS) {
    const hit = await db.collection('users').where({ openid: u.openid }).count()
    if (hit.total === 0) {
      await db.collection('users').add({ data: { ...u, role: 0, gender: '女', create_time: db.serverDate() } })
    }
    userMap[u.openid] = u
  }

  // 2. 写入帖子，拿到 _id
  const postIds = []
  for (const p of POSTS) {
    const now = Date.now() + p.offsetDay * DAY
    const author = USERS[(POSTS.indexOf(p) + 1) % USERS.length]
    const addRes = await db.collection('posts').add({
      data: {
        authorId: author.openid,
        authorName: author.nickname,
        authorAvatar: author.avatar,
        openid: author.openid,
        title: p.title,
        content: p.content,
        images: [],
        category: p.category,
        categories: [p.category],
        is_anonymous: false,
        likeCount: p.likeCount,
        commentCount: p.comments.length,
        status: 1,
        create_time: new Date(now),
        created_at: new Date(now),
        updated_at: new Date(now)
      }
    })
    postIds.push(addRes._id)
  }

  // 3. 写入点赞记录（条数与 likeCount 一致，用模拟账号轮换）
  let likeTotal = 0
  const likeTasks = []
  POSTS.forEach((p, i) => {
    for (let k = 0; k < p.likeCount; k++) {
      const openid = USERS[k % USERS.length].openid
      likeTasks.push(
        db.collection('likes').add({ data: { postId: postIds[i], _openid: openid, create_time: new Date(Date.now() - (Math.random() * 3 + 1) * DAY) } })
      )
      likeTotal++
    }
  })
  // 分批写入，避免一次并发过多
  for (let i = 0; i < likeTasks.length; i += 20) {
    await Promise.all(likeTasks.slice(i, i + 20))
  }

  // 4. 写入评论（条数与 commentCount 一致，时间在帖子之后）
  let commentTotal = 0
  const commentTasks = []
  POSTS.forEach((p, i) => {
    const postTime = Date.now() + p.offsetDay * DAY
    p.comments.forEach((c, ci) => {
      const u = USERS[c.author - 1]
      commentTasks.push(
        db.collection('comments').add({
          data: {
            postId: postIds[i],
            content: c.content,
            authorId: u.openid,
            authorName: u.nickname,
            authorAvatar: u.avatar,
            is_anonymous: false,
            status: 1,
            create_time: new Date(postTime + (ci + 1) * 3600000 + Math.floor(Math.random() * 5) * 3600000)
          }
        })
      )
      commentTotal++
    })
  })
  for (let i = 0; i < commentTasks.length; i += 10) {
    await Promise.all(commentTasks.slice(i, i + 10))
  }

  return {
    code: 0,
    msg: `种子数据写入完成：账号 ${USERS.length} 个、帖子 ${POSTS.length} 条、点赞 ${likeTotal} 条、评论 ${commentTotal} 条`
  }
}
