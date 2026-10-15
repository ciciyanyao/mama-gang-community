// subpkg/edit-profile/edit-profile.js —— 编辑资料页（头像/昵称/简介）
const auth = require('../../utils/auth.js')
const { showError, showSuccess } = require('../../utils/util.js')

Page({
  data: {
    tempAvatar: '',
    tempNickname: '',
    tempBio: '',
    saving: false,
    avatarPreview: '' // 已上传后的 fileID 预览（保留展示用）
  },

  onLoad() {
    const user = auth.getUserInfo()
    if (user) {
      this.setData({
        tempAvatar: user.avatar || user.avatarUrl || '',
        tempNickname: user.nickname || user.nickName || '',
        tempBio: user.bio || ''
      })
    }
  },

  // 微信头像选择器
  onChooseAvatar(e) {
    this.setData({ tempAvatar: e.detail.avatarUrl })
  },

  onNicknameInput(e) {
    this.setData({ tempNickname: e.detail.value })
  },

  onBioInput(e) {
    this.setData({ tempBio: e.detail.value })
  },

  // 保存：上传头像（如有新选）→ login.updateProfile（昵称/头像/简介）→ 更新本地
  async onSave() {
    const { tempAvatar, tempNickname, tempBio } = this.data
    if (!tempAvatar) {
      wx.showToast({ title: '请选择头像', icon: 'none' })
      return
    }
    if (!tempNickname.trim()) {
      wx.showToast({ title: '请输入昵称', icon: 'none' })
      return
    }
    if (this.data.saving) return
    this.setData({ saving: true })
    wx.showLoading({ title: '保存中...', mask: true })

    try {
      // 新选的头像是临时路径（wxfile://），需上传云存储；原 cloud:// 头像直接复用
      let avatar = tempAvatar
      if (tempAvatar.indexOf('cloud://') !== 0 && tempAvatar.indexOf('http') !== 0) {
        const ext = (tempAvatar.split('.').pop() || 'png').toLowerCase()
        const cloudPath = `avatars/${Date.now()}-${Math.floor(Math.random() * 10000)}.${ext}`
        const uploadRes = await wx.cloud.uploadFile({ cloudPath, filePath: tempAvatar })
        avatar = uploadRes.fileID
      }

      const res = await wx.cloud.callFunction({
        name: 'login',
        data: {
          action: 'updateProfile',
          nickname: tempNickname.trim(),
          avatar,
          bio: tempBio.trim()
        }
      })

      wx.hideLoading()
      if (res.result && res.result.code === 0) {
        // 更新本地登录态（含 bio）
        const fresh = { ...auth.getUserInfo(), ...res.result.data }
        auth.setUserInfo(fresh)
        this.setData({ saving: false })
        showSuccess('保存成功')
        setTimeout(() => wx.navigateBack(), 600)
      } else {
        this.setData({ saving: false })
        wx.showToast({ title: (res.result && res.result.msg) || '保存失败', icon: 'none' })
      }
    } catch (err) {
      wx.hideLoading()
      console.error('[edit-profile] 保存失败：', err)
      showError('保存失败，请重试')
      this.setData({ saving: false })
    }
  }
})
