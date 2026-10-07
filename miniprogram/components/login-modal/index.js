// components/login-modal/index.js —— 登录弹窗组件（就地弹出，全站复用）
// 用法：
//   页面 json：{"usingComponents": {"login-modal": "/components/login-modal/index"}}
//   wxml：<login-modal id="loginModal" bind:success="onLoginSuccess" />
//   需要登录时：this.selectComponent('#loginModal').show()
// 登录成功触发 success 事件，页面在 onLoginSuccess 里刷新自己的登录态
const auth = require('../../utils/auth.js')

Component({
  data: {
    visible: false,
    tempAvatar: '',
    tempNickname: '',
    tempGender: 'female', // 性别默认女
    saving: false
  },
  methods: {
    show() {
      this.setData({ visible: true, tempAvatar: '', tempNickname: '', tempGender: 'female' })
    },
    hide() {
      if (this.data.saving) return // 保存中禁止关闭
      this.setData({ visible: false })
    },
    noop() {}, // 阻止点击穿透到遮罩
    onChooseAvatar(e) {
      this.setData({ tempAvatar: e.detail.avatarUrl })
    },
    onNicknameInput(e) {
      this.setData({ tempNickname: e.detail.value })
    },
    onGenderChange(e) {
      this.setData({ tempGender: e.detail.value })
    },
    // 完成登录：上传头像到云存储 → 调 login 云函数 updateProfile → 存本地 → 通知页面
    async saveProfile() {
      const { tempAvatar, tempNickname, tempGender } = this.data
      if (!tempAvatar) {
        wx.showToast({ title: '请选择头像', icon: 'none' })
        return
      }
      if (!tempNickname.trim()) {
        wx.showToast({ title: '请输入昵称', icon: 'none' })
        return
      }
      this.setData({ saving: true })
      try {
        const ext = (tempAvatar.split('.').pop() || 'png').toLowerCase()
        const cloudPath = `avatars/${Date.now()}-${Math.floor(Math.random() * 10000)}.${ext}`
        const uploadRes = await wx.cloud.uploadFile({ cloudPath, filePath: tempAvatar })
        const res = await wx.cloud.callFunction({
          name: 'login',
          data: {
            action: 'updateProfile',
            nickname: tempNickname.trim(),
            avatar: uploadRes.fileID,
            gender: tempGender
          }
        })
        if (res.result && res.result.code === 0) {
          auth.setUserInfo(res.result.data)
          this.setData({ visible: false, saving: false })
          wx.showToast({ title: '登录成功', icon: 'success' })
          this.triggerEvent('success', res.result.data)
        } else {
          wx.showToast({ title: (res.result && res.result.msg) || '保存失败', icon: 'none' })
          this.setData({ saving: false })
        }
      } catch (err) {
        console.error('登录失败：', err)
        wx.showToast({ title: '登录失败，请重试', icon: 'none' })
        this.setData({ saving: false })
      }
    }
  }
})
