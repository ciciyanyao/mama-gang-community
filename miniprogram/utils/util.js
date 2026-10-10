// utils/util.js —— 公共工具函数

/**
 * 格式化时间
 * @param {Date|string|number} date - 日期对象、时间戳或日期字符串
 * @param {string} format - 格式化模式，如 'YYYY-MM-DD HH:mm:ss'
 * @returns {string} 格式化后的时间字符串
 */
const formatTime = (date, format = 'YYYY-MM-DD HH:mm:ss') => {
  if (!date) return ''

  if (typeof date === 'string' || typeof date === 'number') {
    date = new Date(date)
  }

  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()
  const hour = date.getHours()
  const minute = date.getMinutes()
  const second = date.getSeconds()

  const padZero = (n) => (n < 10 ? '0' + n : '' + n)

  return format
    .replace('YYYY', year)
    .replace('MM', padZero(month))
    .replace('DD', padZero(day))
    .replace('HH', padZero(hour))
    .replace('mm', padZero(minute))
    .replace('ss', padZero(second))
}

/**
 * 相对时间（如：刚刚、5分钟前、昨天）
 * @param {Date|string|number} date - 日期
 * @returns {string} 相对时间描述
 */
const relativeTime = (date) => {
  if (!date) return ''

  if (typeof date === 'string' || typeof date === 'number') {
    date = new Date(date)
  }

  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (seconds < 60) return '刚刚'
  if (minutes < 60) return `${minutes}分钟前`
  if (hours < 24) return `${hours}小时前`
  if (days < 2) return '昨天'
  if (days < 7) return `${days}天前`
  return formatTime(date, 'MM-DD')
}

/**
 * 显示成功提示
 * @param {string} title - 提示内容
 */
const showSuccess = (title) => {
  wx.showToast({
    title,
    icon: 'success',
    duration: 2000
  })
}

/**
 * 显示错误提示
 * @param {string} title - 提示内容
 */
const showError = (title) => {
  wx.showToast({
    title,
    icon: 'none',
    duration: 2000
  })
}

/**
 * 显示加载中
 * @param {string} title - 提示内容
 */
const showLoading = (title = '加载中...') => {
  wx.showLoading({
    title,
    mask: true
  })
}

/**
 * 隐藏加载中
 */
const hideLoading = () => {
  wx.hideLoading()
}

/**
 * 确认对话框
 * @param {string} title - 标题
 * @param {string} content - 内容
 * @returns {Promise<boolean>} 用户是否确认
 */
const confirm = (title, content) => {
  return new Promise((resolve) => {
    wx.showModal({
      title,
      content,
      success: (res) => {
        resolve(res.confirm)
      }
    })
  })
}

/**
 * 防抖函数
 * @param {Function} fn - 要执行的函数
 * @param {number} delay - 延迟时间（毫秒）
 * @returns {Function} 防抖后的函数
 */
const debounce = (fn, delay = 300) => {
  let timer = null
  return function(...args) {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      fn.apply(this, args)
    }, delay)
  }
}

/**
 * 节流函数
 * @param {Function} fn - 要执行的函数
 * @param {number} interval - 间隔时间（毫秒）
 * @returns {Function} 节流后的函数
 */
const throttle = (fn, interval = 300) => {
  let lastTime = 0
  return function(...args) {
    const now = Date.now()
    if (now - lastTime >= interval) {
      lastTime = now
      fn.apply(this, args)
    }
  }
}

module.exports = {
  formatTime,
  relativeTime,
  showSuccess,
  showError,
  showLoading,
  hideLoading,
  confirm,
  debounce,
  throttle
}