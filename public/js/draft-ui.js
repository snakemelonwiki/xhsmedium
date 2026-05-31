// draft-ui.js — 草稿恢复UI组件

/**
 * 渲染草稿恢复提示框
 * @returns {string} HTML字符串
 */
function renderDraftRestorePrompt() {
  if (!state.draftRestorePrompt) return '';

  const { formName, timeStr } = state.draftRestorePrompt;

  return `
    <div class="panel draft-restore-panel">
      <div class="draft-restore-content">
        <div class="draft-restore-icon">💾</div>
        <div class="draft-restore-text">
          <strong>检测到未提交的${formName}草稿</strong>
          <p>保存时间：${timeStr}</p>
        </div>
        <div class="draft-restore-actions">
          <button class="primary js-restore-draft" type="button">恢复草稿</button>
          <button class="ghost js-discard-draft" type="button">丢弃草稿</button>
        </div>
      </div>
    </div>
  `;
}

/**
 * 初始化草稿恢复提示
 * @param {string} formType - 表单类型
 */
function initDraftRestorePrompt(formType) {
  if (typeof showDraftRestorePrompt !== 'function') return;

  const hasPrompt = showDraftRestorePrompt(
    formType,
    () => restoreDraft(formType),
    () => discardDraft(formType)
  );

  if (hasPrompt) {
    // 绑定恢复和丢弃按钮事件
    window.requestAnimationFrame(() => {
      document.querySelector('.js-restore-draft')?.addEventListener('click', () => {
        restoreDraft(formType);
      });
      document.querySelector('.js-discard-draft')?.addEventListener('click', () => {
        discardDraft(formType);
      });
    });
  }
}

/**
 * 恢复草稿
 * @param {string} formType - 表单类型
 */
function restoreDraft(formType) {
  if (typeof loadDraftFromLocal !== 'function' || typeof fillFormWithDraft !== 'function') return;

  const draft = loadDraftFromLocal(formType);
  if (!draft) return;

  const formSelector = formType === 'lead' ? '#leadForm' : '#postForm';
  const form = document.querySelector(formSelector);

  if (form) {
    fillFormWithDraft(form, draft.data);
  }

  state.draftRestorePrompt = null;
  setFlash('success', '草稿已恢复', '已填写内容已恢复，可以继续编辑。');
  renderApp();
}

/**
 * 丢弃草稿
 * @param {string} formType - 表单类型
 */
function discardDraft(formType) {
  if (typeof clearDraftFromLocal !== 'function') return;

  clearDraftFromLocal(formType);
  state.draftRestorePrompt = null;
  setFlash('info', '草稿已丢弃', '已清除未提交的草稿。');
  renderApp();
}
