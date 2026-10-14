# mama-gang-community

**妈妈岗宝妈轻量交流社区** —— "大挑"课题《守护"职业连续性"生育支持型就业模式的制度张力与优化路径——基于珠三角妈妈岗的实证调查》配套小程序（副产品）。

> 定位：**论坛交流为主体 + 普法案例库 + 树洞（情绪倾诉）+ 妈妈岗招聘信息（P2 可选）**
> 比赛阶段用开发版/体验版演示，不追求上架。

## 技术栈

- **前端**：微信原生小程序（WXML / WXSS / JS），TabBar 5 个：论坛 / 消息 / ➕发帖 / 树洞 / 我的（中间"+"发布按钮最显眼）
- **后端**：微信云开发（云函数 / 云数据库 / 云存储），**不建服务器**
- **协作**：Git + GitHub 私有仓库

## 环境信息（全队共用，不用各建各的）

| 项 | 值 |
|---|---|
| AppID | `wx5aa48fa7b914e7ee` |
| 云开发环境 ID | `cloud1-d1gxqkgy5a1f2e31a`（单环境，比赛够用） |
| 仓库 | https://github.com/ciciyanyao/mama-gang-community.git |

> 队友不需要注册小程序账号/AppID，只需被加为小程序"开发者成员"（mp.weixin.qq.com 后台）即可用此 AppID 调试。

## 目录结构

```
mama-gang-community/
├── project.config.json        ← 项目配置（AppID、miniprogramRoot、cloudfunctionRoot），提交进仓库
├── project.private.config.json ← 个人本地设置，已 gitignore，不进仓库
├── .gitignore
├── README.md
├── 开发事项.md                 ← 开发总纲（最新口径，先读这个）
├── 需求分析文档.md / .docx      ← 产品向需求（11 章）
├── 需求开发文档.md              ← 分工向（A–F 六类、33 条编号需求、认领登记表）
├── 小程序开发总方案_流程图与任务拆解.html   ← 总流程图 + 甘特 + WBS
├── 工程目录与数据模型V2.html     ← 目录树 / 云函数设计 / 5 集合数据模型
├── 小程序技术详解图解_Git协作_框架对比_上架流程.html ← 名词解释版
├── miniprogram/               ← 前端代码
│   ├── pages/                 ← 8 个页面（index/message/publish/tree-hole/mine/post-detail/cases/case-detail）
│   ├── components/            ← post-card / empty-state / loading
│   ├── utils/                 ← format / audit（内容安全）/ request（云函数封装）
│   ├── config/                ← 全局常量（云环境 ID、板块枚举、角色枚举）
│   ├── images/                ← tabBar 图标、空状态、默认头像（待补）
│   ├── app.js                 ← 全局入口（wx.cloud.init，env 已填）
│   ├── app.json               ← 页面注册 + tabBar（5 个）
│   └── app.wxss
└── cloudfunctions/            ← 云函数（按业务模块合并，action 分发）
    ├── login/    ← login / getUserInfo（✅ 已实现并部署）
    ├── post/     ← create / list / detail / delete（create 内含 msgSecCheck 内容安全审核）
    ├── comment/  ← create / list / delete
    ├── case/     ← list / detail（司法案例，数据来自组内编码成果）
    ├── favorite/ ← add / remove / list
    └── admin/    ← deletePost / deleteComment / handleReport（管理员）
```


## 协作规范

- **分工**：读《需求开发文档.md》，A–F 六类一人挑 2 类，认领后把名字填进分工表
- **提交信息**：`feat:`（功能）/ `fix:`（修复）/ `docs:`（文档）/ `refactor:`（重构）前缀
- **每日铁律**：开工先 pull，只改自己类里的文件，小步提交，push 前群里说一声
- **云函数部署**：右键云函数目录 → 创建并部署：云端安装依赖（不上传 node_modules）；部署前群里同步，避免两人同时动云环境
- **分支**：比赛期页面互不重叠，可直接 main 协作（详见《开发事项.md》3.3）
