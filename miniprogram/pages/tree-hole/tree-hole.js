// pages/tree-hole/tree-hole.js
// 数据来源：cloudfunctions/treehole（post / list / hug），云端持久化
Page({
  data: {
    tags: ['全部', '崩溃', '焦虑', '委屈', '疲惫', '治愈'],
    currentTag: '全部',
    moodInput: '',
    // 确保这里有且只有这 5 张卡片
    cardBackgrounds: [
      '/pages/tree-hole/images/card1.png',
      '/pages/tree-hole/images/card2.png',
      '/pages/tree-hole/images/card3.png',
      '/pages/tree-hole/images/card4.png',
      '/pages/tree-hole/images/card5.png'
    ],
    // 随机装饰物
    decoPool: ['🐻', '🥪', '🥗', '☁️', '⭐', '🍞', '🍃', '☀️'],
    postList: []
  },

  onLoad() {
    // 初始化假数据，随机分配背景
    const randomBg1 = this.data.cardBackgrounds[Math.floor(Math.random() * this.data.cardBackgrounds.length)];
    const randomBg2 = this.data.cardBackgrounds[Math.floor(Math.random() * this.data.cardBackgrounds.length)];
    const randomBg3 = this.data.cardBackgrounds[Math.floor(Math.random() * this.data.cardBackgrounds.length)];
    
    const decorators = ['🐻', '🥪', '🥗', '☁️', '⭐', '🍞', '🍃', '☀️'];

    this.setData({
      postList: [
        { 
          _id: '1', 
          nickname: '晚风没说话', 
          mood: '崩溃', 
          content: '今天老二发烧到 39 度，老大在幼儿园又摔了。一边发烧一边抱着娃往医院跑，站在急诊走廊上突然就哭了，觉得自己好没用。', 
          time: '2小时前', 
          hugCount: 46, 
          hugBtnText: '抱抱你',
          deco1: decorators[Math.floor(Math.random() * decorators.length)],
          deco2: decorators[Math.floor(Math.random() * decorators.length)],
          bgImage: randomBg1
        },
        { 
          _id: '2', 
          nickname: '简单就挺好', 
          mood: '委屈', 
          content: '婆婆当着亲戚的面说我「带个孩子都带不好」，我老公低头玩手机一句话没说。回房间关了灯才敢掉眼泪。', 
          time: '昨天 21:40', 
          hugCount: 88, 
          hugBtnText: '抱抱你',
          deco1: decorators[Math.floor(Math.random() * decorators.length)],
          deco2: decorators[Math.floor(Math.random() * decorators.length)],
          bgImage: randomBg2
        },
        { 
          _id: '3', 
          nickname: '捕捉小开心', 
          mood: '治愈', 
          content: '今天娃自己把玩具收好了，跑过来跟我说「妈妈你今天辛苦了」。就这一句话，我突然觉得两年全职也值了。', 
          time: '昨天 19:02', 
          hugCount: 132, 
          hugBtnText: '抱抱你',
          deco1: decorators[Math.floor(Math.random() * decorators.length)],
          deco2: decorators[Math.floor(Math.random() * decorators.length)],
          bgImage: randomBg3
        }
      ]
    });
  },

  switchTag(e) {
    this.setData({ currentTag: e.currentTarget.dataset.tag });
  },

  onInput(e) {
    this.setData({ moodInput: e.detail.value });
  },

  postMood() {
    const text = this.data.moodInput.trim();
    if (text.length < 5) {
      wx.showToast({ title: '再多写几个字吧', icon: 'none' });
      return;
    }

    const nicknames = [
      "好好吃顿饭", "简单就挺好", "捕捉小开心", "晚风没说话", 
      "人间普通客", "午后有点闷", "日子有点沉", "安静喘口气", 
      "倦了就歇会", "独自看街灯", "随日子浮沉", "听首温柔的歌"
    ];
    const randomName = nicknames[Math.floor(Math.random() * nicknames.length)];

    // 随机抽取一张卡片背景
    const randomBg = this.data.cardBackgrounds[Math.floor(Math.random() * this.data.cardBackgrounds.length)];
    const randomDeco1 = this.data.decoPool[Math.floor(Math.random() * this.data.decoPool.length)];
    const randomDeco2 = this.data.decoPool[Math.floor(Math.random() * this.data.decoPool.length)];

    const newPost = {
      _id: Date.now().toString(),
      nickname: randomName,
      mood: '全部',
      content: text,
      time: '刚刚',
      hugCount: 0,
      hugBtnText: '抱抱你',
      deco1: randomDeco1,
      deco2: randomDeco2,
      bgImage: randomBg
    };

    const newList = [newPost, ...this.data.postList];
    this.setData({ postList: newList, moodInput: '' });
    wx.showToast({ title: '已经投进树洞了', icon: 'success' });
  },

  handleHug(e) {
    const id = e.currentTarget.dataset.id;
    let isHuggedNow = false;

    const list = this.data.postList.map(item => {
      if (item._id === id) {
        if (item.hugBtnText === '已抱抱') {
          item.hugCount -= 1;
          item.hugBtnText = '抱抱你';
          isHuggedNow = false;
        } else {
          item.hugCount += 1;
          item.hugBtnText = '已抱抱';
          isHuggedNow = true;
        }
      }
      return item;
    });
    this.setData({ postList: list });

    if (isHuggedNow) {
      const messages = [
        '给你一个大大的拥抱 🤗', 
        '一切都会好起来的 🌈', 
        '加油！没有过不去的坎 💪', 
        '姐妹抱抱，你不是一个人在战斗 🫂'
      ];
      const randomMsg = messages[Math.floor(Math.random() * messages.length)];
      wx.showToast({ title: randomMsg, icon: 'none', duration: 2000 });
    }
  }
});
