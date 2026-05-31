// debounce.js — 请求防抖管理器
// 避免重复提交和重复刷新

/**
 * 防抖定时器映射
 */
const _debounceTimers = new Map();

/**
 * 提交锁映射（防止重复提交）
 */
const _submitLocks = new Map();

/**
 * 创建防抖函数
 * @param {Function} func - 要防抖的函数
 * @param {number} delay - 延迟时间（毫秒）
 * @param {string} key - 唯一标识符
 * @returns {Function}
 */
function debounce(func, delay, key) {
  return function(...args) {
    const timerId = _debounceTimers.get(key);
    if (timerId) {
      clearTimeout(timerId);
    }

    const newTimerId = setTimeout(() => {
      _debounceTimers.delete(key);
      func.apply(this, args);
    }, delay);

    _debounceTimers.set(key, newTimerId);
  };
}

/**
 * 创建节流函数
 * @param {Function} func - 要节流的函数
 * @param {number} delay - 延迟时间（毫秒）
 * @param {string} key - 唯一标识符
 * @returns {Function}
 */
function throttle(func, delay, key) {
  let lastRun = 0;

  return function(...args) {
    const now = Date.now();

    if (now - lastRun >= delay) {
      lastRun = now;
      func.apply(this, args);
    }
  };
}

/**
 * 包装提交函数，添加提交锁
 * @param {string} lockKey - 锁的唯一标识
 * @param {Function} submitFunc - 提交函数
 * @returns {Function}
 */
function withSubmitLock(lockKey, submitFunc) {
  return async function(...args) {
    // 检查是否已经在提交中
    if (_submitLocks.get(lockKey)) {
      console.warn(`[debounce] Submit already in progress: ${lockKey}`);
      return;
    }

    // 设置提交锁
    _submitLocks.set(lockKey, true);

    try {
      await submitFunc.apply(this, args);
    } finally {
      // 释放提交锁
      _submitLocks.delete(lockKey);
    }
  };
}

/**
 * 检查是否正在提交
 * @param {string} lockKey - 锁的唯一标识
 * @returns {boolean}
 */
function isSubmitting(lockKey) {
  return Boolean(_submitLocks.get(lockKey));
}

/**
 * 清理所有防抖定时器
 */
function cleanupDebounceTimers() {
  _debounceTimers.forEach((timerId) => {
    clearTimeout(timerId);
  });
  _debounceTimers.clear();
}

/**
 * 清理所有提交锁
 */
function cleanupSubmitLocks() {
  _submitLocks.clear();
}
