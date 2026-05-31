// cleanup.js — 资源清理管理器
// 统一管理定时器、事件监听器、未完成请求，避免内存泄漏

/**
 * 全局资源清理注册表
 * 每次 renderApp 前清理旧资源，避免内存泄漏
 */
const _cleanupRegistry = {
  timers: new Set(),           // setTimeout/setInterval 返回的 ID
  intervals: new Set(),        // setInterval 专用（需要 clearInterval）
  eventListeners: [],          // { element, event, handler, options }
  objectUrls: new Set(),       // URL.createObjectURL 创建的 blob URL
};

/**
 * 注册一个 setTimeout，返回 timer ID
 * 页面切换时会自动清理
 */
function registerTimeout(callback, delay) {
  const id = setTimeout(() => {
    _cleanupRegistry.timers.delete(id);
    callback();
  }, delay);
  _cleanupRegistry.timers.add(id);
  return id;
}

/**
 * 注册一个 setInterval，返回 interval ID
 * 页面切换时会自动清理
 */
function registerInterval(callback, delay) {
  const id = setInterval(callback, delay);
  _cleanupRegistry.intervals.add(id);
  return id;
}

/**
 * 手动清除已注册的 timeout
 */
function unregisterTimeout(id) {
  if (_cleanupRegistry.timers.has(id)) {
    clearTimeout(id);
    _cleanupRegistry.timers.delete(id);
  }
}

/**
 * 手动清除已注册的 interval
 */
function unregisterInterval(id) {
  if (_cleanupRegistry.intervals.has(id)) {
    clearInterval(id);
    _cleanupRegistry.intervals.delete(id);
  }
}

/**
 * 注册一个事件监听器
 * 页面切换时会自动移除
 */
function registerEventListener(element, event, handler, options) {
  if (!element || !event || !handler) return;
  element.addEventListener(event, handler, options);
  _cleanupRegistry.eventListeners.push({ element, event, handler, options });
}

/**
 * 注册一个 Object URL（blob URL）
 * 页面切换时会自动 revoke
 */
function registerObjectUrl(url) {
  if (url && typeof url === 'string') {
    _cleanupRegistry.objectUrls.add(url);
  }
  return url;
}

/**
 * 手动 revoke 一个 Object URL
 */
function revokeObjectUrl(url) {
  if (_cleanupRegistry.objectUrls.has(url)) {
    try {
      URL.revokeObjectURL(url);
    } catch (err) {
      console.warn('[cleanup] revokeObjectURL failed', err);
    }
    _cleanupRegistry.objectUrls.delete(url);
  }
}

/**
 * 清理所有已注册的资源
 * 在 renderApp 开始时调用，确保旧页面的资源被释放
 */
function cleanupAllResources(options = {}) {
  // 清理所有 setTimeout
  _cleanupRegistry.timers.forEach((id) => {
    try { clearTimeout(id); } catch {}
  });
  _cleanupRegistry.timers.clear();

  // 清理所有 setInterval
  _cleanupRegistry.intervals.forEach((id) => {
    try { clearInterval(id); } catch {}
  });
  _cleanupRegistry.intervals.clear();

  // 移除所有事件监听器
  _cleanupRegistry.eventListeners.forEach(({ element, event, handler, options }) => {
    try {
      if (element && element.removeEventListener) {
        element.removeEventListener(event, handler, options);
      }
    } catch (err) {
      console.warn('[cleanup] removeEventListener failed', err);
    }
  });
  _cleanupRegistry.eventListeners = [];

  // Revoke 所有 Object URLs
  _cleanupRegistry.objectUrls.forEach((url) => {
    try {
      URL.revokeObjectURL(url);
    } catch (err) {
      console.warn('[cleanup] revokeObjectURL failed', err);
    }
  });
  _cleanupRegistry.objectUrls.clear();

  // 清理分页器实例
  if (typeof destroyAllPaginators === 'function') {
    try {
      destroyAllPaginators();
    } catch (err) {
      console.warn('[cleanup] destroyAllPaginators failed', err);
    }
  }

  // 取消所有未完成的 API 请求：只在明确离开视图/登出时执行，普通 render 不应中断提交。
  if (options.abortRequests && typeof abortAllPendingRequests === 'function') {
    try {
      abortAllPendingRequests();
    } catch (err) {
      console.warn('[cleanup] abortAllPendingRequests failed', err);
    }
  }
}

/**
 * 获取当前资源使用统计（用于调试）
 */
function getCleanupStats() {
  return {
    timers: _cleanupRegistry.timers.size,
    intervals: _cleanupRegistry.intervals.size,
    eventListeners: _cleanupRegistry.eventListeners.length,
    objectUrls: _cleanupRegistry.objectUrls.size,
  };
}
