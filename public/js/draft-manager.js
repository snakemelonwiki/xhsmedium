// draft-manager.js — 表单草稿管理器
// 实现表单草稿实时保存（localStorage + 后端同步）

/**
 * 草稿存储键前缀
 */
const DRAFT_PREFIX = 'lan_system_draft_';
const MAX_DRAFTS_PER_USER = 10;

/**
 * 防抖定时器映射
 */
const _draftDebounceTimers = new Map();

/**
 * 获取草稿存储键
 * @param {string} formType - 表单类型 (lead/post)
 * @param {string} userId - 用户ID
 * @returns {string}
 */
function getDraftKey(formType, userId) {
  return `${DRAFT_PREFIX}${formType}_${userId}`;
}

/**
 * 保存草稿到 localStorage
 * @param {string} formType - 表单类型
 * @param {Object} data - 草稿数据
 */
function saveDraftToLocal(formType, data) {
  if (!state.user?.id) return;

  const key = getDraftKey(formType, state.user.id);
  const draft = {
    data,
    timestamp: Date.now(),
    formType
  };

  try {
    localStorage.setItem(key, JSON.stringify(draft));
  } catch (err) {
    console.warn('[draft] localStorage save failed', err);
  }
}

/**
 * 从 localStorage 读取草稿
 * @param {string} formType - 表单类型
 * @returns {Object|null}
 */
function loadDraftFromLocal(formType) {
  if (!state.user?.id) return null;

  const key = getDraftKey(formType, state.user.id);

  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;

    const draft = JSON.parse(raw);
    // 草稿超过24小时自动过期
    if (Date.now() - draft.timestamp > 24 * 60 * 60 * 1000) {
      localStorage.removeItem(key);
      return null;
    }

    return draft;
  } catch (err) {
    console.warn('[draft] localStorage load failed', err);
    return null;
  }
}

/**
 * 清除本地草稿
 * @param {string} formType - 表单类型
 */
function clearDraftFromLocal(formType) {
  if (!state.user?.id) return;

  const key = getDraftKey(formType, state.user.id);
  localStorage.removeItem(key);
}

/**
 * 从表单元素提取数据
 * @param {HTMLFormElement} form - 表单元素
 * @returns {Object}
 */
function extractFormData(form) {
  if (!form) return {};

  const data = {};
  const formData = new FormData(form);

  for (const [key, value] of formData.entries()) {
    // 跳过文件类型和隐藏的ID字段
    if (key === 'id' || key === 'coverImage' || key === 'captureImage') continue;
    data[key] = value;
  }

  return data;
}

/**
 * 将草稿数据填充到表单
 * @param {HTMLFormElement} form - 表单元素
 * @param {Object} data - 草稿数据
 */
function fillFormWithDraft(form, data) {
  if (!form || !data) return;

  for (const [key, value] of Object.entries(data)) {
    const field = form.elements[key];
    if (!field) continue;

    if (field.type === 'checkbox') {
      field.checked = Boolean(value);
    } else if (field.type === 'radio') {
      const radio = form.querySelector(`input[name="${key}"][value="${value}"]`);
      if (radio) radio.checked = true;
    } else {
      field.value = value || '';
    }
  }
}

/**
 * 自动保存表单草稿（带防抖）
 * @param {string} formType - 表单类型
 * @param {HTMLFormElement} form - 表单元素
 * @param {number} delay - 防抖延迟（毫秒）
 */
function autoSaveDraft(formType, form, delay = 1000) {
  if (!form) return;

  // 清除之前的定时器
  const timerId = _draftDebounceTimers.get(formType);
  if (timerId) {
    clearTimeout(timerId);
  }

  // 设置新的定时器
  const newTimerId = setTimeout(() => {
    const data = extractFormData(form);
    saveDraftToLocal(formType, data);
    _draftDebounceTimers.delete(formType);
  }, delay);

  _draftDebounceTimers.set(formType, newTimerId);
}

/**
 * 立即保存草稿（不防抖）
 * @param {string} formType - 表单类型
 * @param {HTMLFormElement} form - 表单元素
 */
function saveDraftNow(formType, form) {
  if (!form) return;

  // 取消防抖定时器
  const timerId = _draftDebounceTimers.get(formType);
  if (timerId) {
    clearTimeout(timerId);
    _draftDebounceTimers.delete(formType);
  }

  const data = extractFormData(form);
  saveDraftToLocal(formType, data);
}

/**
 * 检查是否有未提交的草稿
 * @param {string} formType - 表单类型
 * @returns {boolean}
 */
function hasDraft(formType) {
  const draft = loadDraftFromLocal(formType);
  return draft !== null;
}

/**
 * 显示草稿恢复提示
 * @param {string} formType - 表单类型
 * @param {Function} onRestore - 恢复回调
 * @param {Function} onDiscard - 丢弃回调
 */
function showDraftRestorePrompt(formType, onRestore, onDiscard) {
  const draft = loadDraftFromLocal(formType);
  if (!draft) return false;

  const formName = formType === 'lead' ? '客资' : '作品';
  const timeStr = new Date(draft.timestamp).toLocaleString('zh-CN');

  state.draftRestorePrompt = {
    formType,
    formName,
    timeStr,
    onRestore,
    onDiscard
  };

  return true;
}

/**
 * 绑定表单自动保存事件
 * @param {string} formType - 表单类型
 * @param {string} formSelector - 表单选择器
 */
function bindFormAutoSave(formType, formSelector) {
  const form = document.querySelector(formSelector);
  if (!form) return;

  // 监听所有输入变化
  const inputs = form.querySelectorAll('input, select, textarea');
  inputs.forEach((input) => {
    // 跳过文件输入
    if (input.type === 'file') return;

    input.addEventListener('input', () => {
      autoSaveDraft(formType, form);
    });

    input.addEventListener('change', () => {
      autoSaveDraft(formType, form);
    });
  });
}

/**
 * 清理所有草稿定时器
 */
function cleanupDraftTimers() {
  _draftDebounceTimers.forEach((timerId) => {
    clearTimeout(timerId);
  });
  _draftDebounceTimers.clear();
}
