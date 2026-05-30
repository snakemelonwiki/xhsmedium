// pagination.js — vanilla JS 简版分页器（不再依赖 paginationjs）
// 提供 setupPagination(containerId, opts) 一键挂载分页器
// 业务方传 fetchPage(page, pageSize) -> Promise<{items, total}> + renderItems(items)

/**
 * 全局分页器登记表，便于 renderApp 重渲染时清理旧实例
 * key = containerId，value = { destroy(), refresh() }
 */
const _paginators = new Map();

const PAG_SIZES = [10, 20, 50, 100];

/**
 * 在 containerId 元素里挂一个分页器
 * @param {string} containerId  容器元素 id
 * @param {object} opts
 *   - pageSize        默认每页条数（默认 20）
 *   - fetchPage(page, pageSize, offset) -> Promise<{items, total}>
 *   - renderItems(items)        每翻一页时业务方负责把 items 渲染到 DOM
 */
function setupPagination(containerId, opts) {
  const container = document.getElementById(containerId);
  if (!container) return;

  // 清理旧实例
  if (_paginators.has(containerId)) {
    try { _paginators.get(containerId).destroy(); } catch {}
    _paginators.delete(containerId);
  }

  const state = {
    page: 1,
    pageSize: opts.pageSize || 20,
    total: 0,
    loading: false,
  };

  function totalPages() {
    return Math.max(1, Math.ceil(state.total / state.pageSize));
  }

  function render() {
    const tp = totalPages();
    const cp = Math.min(Math.max(1, state.page), tp);
    state.page = cp;

    const sizeSelect = `<select class="pag-size-select">${PAG_SIZES.map(n => `<option value="${n}"${n === state.pageSize ? ' selected' : ''}>每页 ${n} 条</option>`).join('')}</select>`;

    const pageButtons = renderPageButtons(cp, tp);

    container.innerHTML = `
      <div class="pag-bar">
        <span class="pag-info">共 ${state.total} 条 · 当前 ${cp}/${tp} 页</span>
        <div class="pag-pages">
          <button class="pag-btn pag-prev" type="button"${cp <= 1 ? ' disabled' : ''}>上一页</button>
          ${pageButtons}
          <button class="pag-btn pag-next" type="button"${cp >= tp ? ' disabled' : ''}>下一页</button>
        </div>
        <div class="pag-go">
          <span>跳至</span>
          <input type="number" class="pag-go-input" min="1" max="${tp}" value="${cp}" placeholder="${cp}" style="width:50px;" />
          <span>页</span>
          <button class="pag-btn pag-go-btn" type="button">前往</button>
          ${sizeSelect}
        </div>
      </div>
    `;

    container.querySelector('.pag-prev')?.addEventListener('click', () => goTo(cp - 1));
    container.querySelector('.pag-next')?.addEventListener('click', () => goTo(cp + 1));
    container.querySelectorAll('.pag-page').forEach(btn => btn.addEventListener('click', () => goTo(Number(btn.dataset.page))));
    container.querySelector('.pag-go-btn')?.addEventListener('click', () => {
      const v = Number(container.querySelector('.pag-go-input').value) || 1;
      goTo(v);
    });
    container.querySelector('.pag-size-select')?.addEventListener('change', (e) => {
      state.pageSize = Number(e.target.value) || 20;
      state.page = 1;
      load();
    });
  }

  function renderPageButtons(cur, total) {
    if (total <= 7) {
      return Array.from({length: total}, (_, i) => i + 1)
        .map(p => `<button class="pag-btn pag-page${p === cur ? ' active' : ''}" data-page="${p}" type="button">${p}</button>`)
        .join('');
    }
    // 超过 7 页用省略号
    const buttons = [];
    const push = (p) => buttons.push(`<button class="pag-btn pag-page${p === cur ? ' active' : ''}" data-page="${p}" type="button">${p}</button>`);
    push(1);
    if (cur > 4) buttons.push('<span class="pag-ellipsis">…</span>');
    const start = Math.max(2, cur - 2);
    const end = Math.min(total - 1, cur + 2);
    for (let p = start; p <= end; p++) push(p);
    if (cur < total - 3) buttons.push('<span class="pag-ellipsis">…</span>');
    push(total);
    return buttons.join('');
  }

  function goTo(page) {
    const tp = totalPages();
    state.page = Math.min(Math.max(1, page), tp);
    load();
  }

  function load() {
    if (state.loading) return;
    state.loading = true;
    const offset = (state.page - 1) * state.pageSize;
    Promise.resolve(opts.fetchPage(state.page, state.pageSize, offset))
      .then((result) => {
        const items = Array.isArray(result?.items) ? result.items : (Array.isArray(result) ? result : []);
        const total = Number(result?.total ?? items.length);
        state.total = total;
        try { opts.renderItems(items); } catch (err) { console.warn('[pagination] renderItems failed', err); }
        render();
      })
      .catch((err) => {
        console.warn('[pagination] fetch failed', err);
        try { opts.renderItems([]); } catch {}
        state.total = 0;
        render();
      })
      .finally(() => { state.loading = false; });
  }

  // 首次加载
  load();

  const handle = {
    destroy: () => { container.innerHTML = ''; },
    refresh: () => { state.page = 1; load(); },
    refreshKeepPage: () => load(),
  };
  _paginators.set(containerId, handle);
  return handle;
}

/**
 * 主动触发某个分页器重新加载（业务保存后调用，回到第 1 页）
 */
function refreshPagination(containerId) {
  const p = _paginators.get(containerId);
  if (p) p.refresh();
}

/**
 * 不重置页码地刷新（用于筛选条件变化以外的场景）
 */
function refreshPaginationKeepPage(containerId) {
  const p = _paginators.get(containerId);
  if (p) p.refreshKeepPage();
}

/**
 * renderApp 全量重渲染前清掉所有分页器实例（避免内存泄漏）
 */
function destroyAllPaginators() {
  _paginators.forEach((p) => { try { p.destroy(); } catch {} });
  _paginators.clear();
}
