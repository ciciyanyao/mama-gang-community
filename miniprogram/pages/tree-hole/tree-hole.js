Page({
  data: {
    tags: ['全部', '崩溃', '焦虑', '委屈', '疲惫', '治愈'],
    currentTag: '全部',
    moodInput: '',
    // 假数据保留作为备胎
    postList: [
      { _id: '1', userId: '3208', mood: '崩溃', content: '今天老二发烧到 39 度，老大在幼儿园又摔了。一边发烧一边抱着娃往医院跑，站在急诊走廊上突然就哭了，觉得自己好没用。', time: '2小时前', hugCount: 46 },
      { _id: '2', userId: '7741', mood: '委屈', content: '婆婆当着亲戚的面说我「带个孩子都带不好」，我老公低头玩手机一句话没说。回房间关了灯才敢掉眼泪。', time: '昨天 21:40', hugCount: 88 },
      { _id: '3', userId: '1180', mood: '治愈', content: '今天娃自己把玩具收好了，跑过来跟我说「妈妈你今天辛苦了」。就这一句话，我突然觉得两年全职也值了。', time: '昨天 19:02', hugCount: 132 }
    ]
  },

  // 页面加载时，尝试去后台拿真实数据
  onLoad() {
    this.loadPostList();
  },

  // 去后台拿数据的方法
  loadPostList() {
    const that = this;
    // 调用名叫 'post' 的云函数
    wx.cloud.callFunction({
      name: 'post', 
      data: {
        action: 'list',           // 告诉后台，我要“列出帖子”
        category: '情绪倾诉',      // 只要“情绪倾诉”板块的
        is_anonymous: true        // 只要“匿名”的
      },
      success(res) {
        // 如果后台成功返回了数据
        if (res.result && res.result.data && res.result.data.length > 0) {
          that.setData({ postList: res.result.data }); // 用真实数据替换假数据
          wx.showToast({ title: '数据加载成功', icon: 'none' });
        }
      },
      fail(err) {
        // 如果后台还没写好，或者报错了，这里会触发
        console.log('云函数还没准备好，先用本地假数据撑着:', err);
        // 这里我们什么都不做，页面会继续显示咱们写好的假数据
      }
    });
  },

  switchTag(e) {
    this.setData({ currentTag: e.currentTarget.dataset.tag });
  },

  onInput(e) {
    this.setData({ moodInput: e.detail.value });
  },

  handleHug(e) {
    const id = e.currentTarget.dataset.id;
    const list = this.data.postList.map(item => {
      if (item._id === id) item.hugCount += 1;
      return item;
    });
    this.setData({ postList: list });
    wx.showToast({ title: '拥抱已送到', icon: 'success' });
  },

  postMood() {
    if (this.data.moodInput.length < 5) {
      wx.showToast({ title: '再多写几个字吧', icon: 'none' });
      return;
    }
    // 真实发帖逻辑，等后台就绪后再打开这段代码
    /*
    wx.cloud.callFunction({
      name: 'post',
      data: {
        action: 'create',
        content: this.data.moodInput,
        category: '情绪倾诉',
        is_anonymous: true
      },
      success: (res) => {
        wx.showToast({ title: '已投进树洞', icon: 'success' });
        this.setData({ moodInput: '' });
        this.loadPostList(); // 重新拉取最新数据
      }
    });
    */
    // 暂时用前端假动作替代：
    wx.showToast({ title: '已投进树洞（演示）', icon: 'success' });
    this.setData({ moodInput: '' });
  }
});