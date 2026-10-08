# F2: TabBar红点实现指南

## 任务说明

- **优先级**：P1
- **目标**：有未读消息时显示红点
- **实现方式**：MVP版本进消息页即算已读
- **技术点**：wx.showTabBarRedDot

## 实现步骤

### 1. 修改消息页面（pages/message/message.js）

在页面显示时检查未读消息：

```javascript
Page({
  data: {
    messageList: [],
    hasUnread: false
  },
  
  onLoad() {
    this.loadMessages();
    this.checkUnreadMessages();
  },
  
  onShow() {
    // 每次显示页面时检查未读消息
    this.checkUnreadMessages();
  },
  
  // 检查未读消息
  async checkUnreadMessages() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'comment',
        data: {
          action: 'checkUnread'
        }
      });
      
      if (res.result.code === 0) {
        const hasUnread = res.result.data.hasUnread;
        this.setData({ hasUnread });
        
        // 更新TabBar红点
        if (hasUnread) {
          wx.showTabBarRedDot({
            index: 1 // 消息页的索引
          });
        } else {
          wx.hideTabBarRedDot({
            index: 1
          });
        }
      }
    } catch (err) {
      console.error('检查未读消息失败', err);
    }
  },
  
  // 标记消息为已读
  async markMessagesAsRead() {
    try {
      await wx.cloud.callFunction({
        name: 'comment',
        data: {
          action: 'markRead'
        }
      });
      
      // 隐藏红点
      wx.hideTabBarRedDot({
        index: 1
      });
      
      this.setData({ hasUnread: false });
    } catch (err) {
      console.error('标记已读失败', err);
    }
  },
  
  onShow() {
    // 进入消息页即算已读
    this.markMessagesAsRead();
    this.loadMessages();
  }
});
```

### 2. 修改云函数（comment/index.js）

添加检查未读消息和标记已读的操作：

```javascript
// 检查未读消息
async function handleCheckUnread(event, context) {
  const db = cloud.database();
  const _ = db.command;
  const { OPENID } = cloud.getWXContext();
  
  try {
    // 获取用户发布的帖子
    const userPosts = await db.collection('posts')
      .where({
        _openid: OPENID,
        status: 1
      })
      .field({ _id: true })
      .get();
    
    const postIds = userPosts.data.map(post => post._id);
    
    if (postIds.length === 0) {
      return {
        code: 0,
        data: { hasUnread: false }
      };
    }
    
    // 检查是否有未读评论
    const unreadComments = await db.collection('comments')
      .where({
        postId: _.in(postIds),
        _openid: _.neq(OPENID),
        status: 1,
        is_read: _.neq(true) // 未读标记
      })
      .limit(1)
      .get();
    
    return {
      code: 0,
      data: {
        hasUnread: unreadComments.data.length > 0
      }
    };
  } catch (err) {
    return {
      code: -1,
      message: '检查未读消息失败',
      error: err.message
    };
  }
}

// 标记消息为已读
async function handleMarkRead(event, context) {
  const db = cloud.database();
  const _ = db.command;
  const { OPENID } = cloud.getWXContext();
  
  try {
    // 获取用户发布的帖子
    const userPosts = await db.collection('posts')
      .where({
        _openid: OPENID,
        status: 1
      })
      .field({ _id: true })
      .get();
    
    const postIds = userPosts.data.map(post => post._id);
    
    if (postIds.length === 0) {
      return {
        code: 0,
        message: '无需标记'
      };
    }
    
    // 标记所有未读评论为已读
    await db.collection('comments')
      .where({
        postId: _.in(postIds),
        _openid: _.neq(OPENID),
        status: 1,
        is_read: _.neq(true)
      })
      .update({
        data: {
          is_read: true
        }
      });
    
    return {
      code: 0,
      message: '标记已读成功'
    };
  } catch (err) {
    return {
      code: -1,
      message: '标记已读失败',
      error: err.message
    };
  }
}
```

在主函数中添加路由：

```javascript
// 在 switch (event.action) 中添加
case 'checkUnread':
  return await handleCheckUnread(event, context);
case 'markRead':
  return await handleMarkRead(event, context);
```

### 3. 修改评论功能（comment/index.js）

在创建评论时添加未读标记：

```javascript
// 修改 handleCreateComment 函数
async function handleCreateComment(event, context) {
  const db = cloud.database();
  const { postId, content } = event;
  const { OPENID } = cloud.getWXContext();
  
  try {
    // ... 其他代码 ...
    
    // 创建评论时添加未读标记
    const commentData = {
      postId,
      _openid: OPENID,
      content,
      create_time: db.serverDate(),
      status: 1,
      is_read: false // 新评论默认未读
    };
    
    // ... 其他代码 ...
  } catch (err) {
    // ... 错误处理 ...
  }
}
```

## 数据模型

### comments集合（新增字段）
- `is_read` - 是否已读（true/false）

## 验收标准

- ✅ 有未读消息时TabBar显示红点
- ✅ 进入消息页后红点消失
- ✅ 新评论默认未读
- ✅ 进入消息页即算已读

## 测试方法

1. 用户A发布帖子
2. 用户B评论该帖子
3. 用户A查看TabBar是否有红点
4. 用户A进入消息页
5. 验证红点消失

## 注意事项

1. MVP版本：进消息页即算已读，不追踪具体哪条消息已读
2. 红点显示在TabBar的消息图标上
3. 可以考虑添加未读消息数量显示
4. 避免频繁调用云函数，可以设置缓存

## 优化建议

1. **未读数量**：可以显示未读消息数量，而不仅仅是红点
2. **消息缓存**：本地缓存未读状态，减少云函数调用
3. **推送通知**：可以结合订阅消息，发送推送通知
4. **已读状态**：可以追踪具体哪条消息已读
