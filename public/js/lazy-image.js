// lazy-image.js — 图片懒加载管理器
// 实现图片懒加载、缩略图和原图分离，避免一次性加载大量图片

/**
 * 全局 IntersectionObserver 实例
 * 监听图片元素进入视口时才加载
 */
let _lazyImageObserver = null;

/**
 * 初始化懒加载观察器
 * 在页面加载时调用一次即可
 */
function initLazyImageObserver() {
  if (_lazyImageObserver) return;

  // 检查浏览器是否支持 IntersectionObserver
  if (!('IntersectionObserver' in window)) {
    console.warn('[lazy-image] IntersectionObserver not supported, falling back to immediate loading');
    return;
  }

  const options = {
    root: null,           // 使用视口作为根元素
    rootMargin: '50px',   // 提前 50px 开始加载
    threshold: 0.01       // 元素 1% 可见时触发
  };

  _lazyImageObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const img = entry.target;
        loadLazyImage(img);
        observer.unobserve(img);
      }
    });
  }, options);
}

/**
 * 加载懒加载图片
 * @param {HTMLImageElement} img 图片元素
 */
function loadLazyImage(img) {
  const src = img.dataset.src;
  if (!src) return;

  // 创建一个新的 Image 对象预加载
  const tempImg = new Image();
  tempImg.onload = () => {
    img.src = src;
    img.classList.remove('lazy-loading');
    img.classList.add('lazy-loaded');
    delete img.dataset.src;
  };
  tempImg.onerror = () => {
    img.classList.remove('lazy-loading');
    img.classList.add('lazy-error');
    // 显示占位图或错误提示
    img.alt = '图片加载失败';
  };
  tempImg.src = src;
}

/**
 * 观察页面中所有需要懒加载的图片
 * 在每次 renderApp 后调用
 */
function observeLazyImages() {
  if (!_lazyImageObserver) {
    initLazyImageObserver();
  }

  // 如果浏览器不支持 IntersectionObserver，直接加载所有图片
  if (!_lazyImageObserver) {
    document.querySelectorAll('img[data-src]').forEach((img) => {
      loadLazyImage(img);
    });
    return;
  }

  // 观察所有带 data-src 属性的图片
  document.querySelectorAll('img[data-src]').forEach((img) => {
    img.classList.add('lazy-loading');
    _lazyImageObserver.observe(img);
  });
}

/**
 * 停止观察所有图片（页面卸载时调用）
 */
function disconnectLazyImageObserver() {
  if (_lazyImageObserver) {
    _lazyImageObserver.disconnect();
  }
}

/**
 * 生成缩略图 URL
 * 如果图片服务支持缩略图参数，可以在这里添加
 * @param {string} originalUrl 原图 URL
 * @param {number} width 缩略图宽度
 * @returns {string} 缩略图 URL
 */
function getThumbnailUrl(originalUrl, width = 300) {
  if (!originalUrl) return '';

  if (originalUrl.includes('?')) {
    return `${originalUrl}&thumb=1&w=${width}`;
  }

  // 如果是本地上传的图片，暂时返回原图
  if (originalUrl.startsWith('/uploads/')) {
    return `${originalUrl}?thumb=1&w=${width}`;
  }

  // 如果是外部图片服务，可以添加缩略图参数
  // 例如：阿里云 OSS、七牛云等
  // return `${originalUrl}?x-oss-process=image/resize,w_${width}`;

  return `${originalUrl}?thumb=1&w=${width}`;
}

/**
 * 创建懒加载图片的 HTML
 * @param {string} src 图片 URL
 * @param {string} alt 图片描述
 * @param {string} className 额外的 CSS 类名
 * @param {boolean} useThumbnail 是否使用缩略图
 * @returns {string} HTML 字符串
 */
function createLazyImageHtml(src, alt = '', className = '', useThumbnail = true) {
  if (!src) {
    return `<div class="image-placeholder ${className}">暂无图片</div>`;
  }

  const thumbnailSrc = useThumbnail ? getThumbnailUrl(src) : src;
  const placeholderSrc = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 200"%3E%3Crect fill="%23f0f0f0" width="300" height="200"/%3E%3C/svg%3E';

  return `<img
    src="${placeholderSrc}"
    data-src="${thumbnailSrc}"
    alt="${escapeHtmlAttribute(alt)}"
    class="lazy-image ${className}"
    loading="lazy"
  />`;
}

/**
 * 为图片按钮创建懒加载 HTML
 * @param {string} src 图片 URL
 * @param {string} alt 图片描述
 * @param {string} className 额外的 CSS 类名
 * @returns {string} HTML 字符串
 */
function createLazyImageButtonHtml(src, alt = '', className = '') {
  if (!src) {
    return `<div class="image-placeholder ${className}">暂无图片</div>`;
  }

  const thumbnailSrc = getThumbnailUrl(src);
  const placeholderSrc = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 200"%3E%3Crect fill="%23f0f0f0" width="300" height="200"/%3E%3C/svg%3E';

  return `<button class="image-trigger js-open-image" data-src="${escapeHtmlAttribute(src)}" type="button">
    <img
      src="${placeholderSrc}"
      data-src="${thumbnailSrc}"
      alt="${escapeHtmlAttribute(alt)}"
      class="lazy-image ${className}"
      loading="lazy"
    />
  </button>`;
}

/**
 * 预加载关键图片（首屏可见的图片）
 * @param {string[]} urls 图片 URL 数组
 */
function preloadImages(urls) {
  if (!Array.isArray(urls)) return;

  urls.forEach((url) => {
    if (!url) return;
    const img = new Image();
    img.src = url;
  });
}
