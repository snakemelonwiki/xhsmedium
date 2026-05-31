// orders-views.js — P0 缺失视图集中实现
// 包含：
//   - T-L6 销售客资详情页
//   - 销售订单跟进视图 + 详情
//   - 主管端订单看板 + 详情
//   - 教务端订单池 + 详情 + 异常订单
//   - 5 个导出按钮触发逻辑（triggerExport）
// 与现有 split 文件风格一致：全部挂全局，不使用 import/export。

// ===========================================================================
// 通用：订单状态 / 付款状态 中文映射
// ===========================================================================
const ORDER_STATUS_LABELS = {
  to_receive: "待接收",
  in_progress: "进行中",
  awaiting_client_info: "待客户资料",
  awaiting_teacher: "待老师安排",
  to_deliver: "待交付",
  completed: "已完成",
  abnormal: "异常"
};

const PAID_STATUS_LABELS = {
  unpaid: "未付款",
  partial: "部分付款",
  paid: "已付款"
};

const ORDER_STATUS_OPTIONS = [
  "to_receive", "in_progress", "awaiting_client_info",
  "awaiting_teacher", "to_deliver", "completed", "abnormal"
];

const PAID_STATUS_OPTIONS = ["unpaid", "partial", "paid"];

function getOrderStatusLabel(code) {
  return ORDER_STATUS_LABELS[code] || code || "-";
}

function getPaidStatusLabel(code) {
  return PAID_STATUS_LABELS[code] || code || "-";
}

function formatOrderAmount(value) {
  if (value === null || value === undefined || value === "") return "-";
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value);
  return `¥${num.toFixed(2)}`;
}

function shortOrderId(id) {
  if (!id) return "-";
  const s = String(id);
  return s.length > 12 ? s.slice(0, 8) + "..." : s;
}

function findOrderUserLabel(userId) {
  if (!userId) return "-";
  const u = (state.users || []).find((item) => item && item.id === userId);
  return u?.employeeName || u?.username || userId;
}

function findLeadByIdLite(leadId) {
  return (state.leads || []).find((item) => item && item.id === leadId) || null;
}


// ===========================================================================
// 任务 1：T-L6 销售客资详情页
// ===========================================================================
async function loadSalesLeadDetail(id) {
  if (!id) return;
  state.salesLeadDetailLoading = true;
  try {
    const lead = (state.leads || []).find((item) => item && item.id === id);
    if (!lead && typeof loadData === "function") {
      await loadData();
    }
    const [records, collabs] = await Promise.all([
      api(`/api/leads/${id}/follow-records?limit=50`).catch(() => []),
      api(`/api/collaboration-tasks?leadId=${encodeURIComponent(id)}&actorUserId=${encodeURIComponent(state.user?.id || "")}`).catch(() => [])
    ]);
    state.salesLeadFollowRecords = Array.isArray(records) ? records : [];
    state.salesLeadCollabs = Array.isArray(collabs) ? collabs : [];
  } catch (err) {
    state.salesLeadFollowRecords = state.salesLeadFollowRecords || [];
    state.salesLeadCollabs = state.salesLeadCollabs || [];
  } finally {
    state.salesLeadDetailLoading = false;
    renderApp();
  }
}

function openSalesLeadDetail(id) {
  state.salesLeadDetailId = id;
  state.salesLeadFollowRecords = null;
  state.salesLeadCollabs = null;
  state.salesLeadDetailTab = "timeline";
  state.currentView = "sales-lead-detail";
  loadSalesLeadDetail(id);
  renderApp();
}

function backToSalesFollowups() {
  state.currentView = "sales-followups";
  state.salesLeadDetailId = null;
  state.salesLeadFollowRecords = null;
  state.salesLeadCollabs = null;
  renderApp();
}

function renderSalesLeadDetail() {
  const id = state.salesLeadDetailId;
  if (!id) {
    return `<div class="empty">未选中客资。<button class="ghost js-back-sales-followups" type="button">返回跟进看板</button></div>`;
  }
  const lead = (state.leads || []).find((item) => item && item.id === id);
  if (!lead) {
    return `
      <div class="sales-lead-detail-page">
        <div class="page-header page-header-rich">
          <div>
            <h2>客资详情</h2>
            <p class="page-desc">未找到客资数据，可能已被删除。</p>
          </div>
          <div class="toolbar toolbar-end">
            <button class="ghost js-back-sales-followups" type="button">返回跟进看板</button>
          </div>
        </div>
      </div>
    `;
  }
  const tab = state.salesLeadDetailTab || "timeline";
  const records = Array.isArray(state.salesLeadFollowRecords) ? state.salesLeadFollowRecords : null;
  const collabs = Array.isArray(state.salesLeadCollabs) ? state.salesLeadCollabs : null;
  const intentionLevel = lead.intentionLevel || "pending";
  const processStatus = lead.processStatus || "not_contacted";
  const nextFollow = lead.nextFollowTime ? String(lead.nextFollowTime).slice(0, 16).replace(" ", "T") : "";
  const addStatus = lead.addStatus || "未添加";
  const addStatusAdded = isAddStatusAdded(addStatus);
  const addStatusLabel = getAddStatusLabel(addStatus);

  const renderInfoSection = () => `
    <section class="detail-section">
      <h3>客户信息</h3>
      <div class="detail-grid">
        <div class="field"><strong>客资编号</strong><span>${formatLeadCode(lead.leadCode)}</span></div>
        <div class="field"><strong>客户昵称</strong><span>${lead.nickname || "-"}</span></div>
        <div class="field"><strong>联系方式</strong>
          <span>${lead.contactInfo ? `<button class="ghost lead-inline-copy js-copy-contact" data-contact="${escapeHtmlAttribute(lead.contactInfo)}" type="button">${escapeHtml(lead.contactInfo)} · 点击复制</button>` : "-"}</span>
        </div>
        <div class="field"><strong>IP / 地区</strong><span>${lead.ip || "-"}</span></div>
        <div class="field"><strong>专业 / 需求</strong><span>${lead.majorContent || "-"}</span></div>
        <div class="field"><strong>预算</strong><span>${lead.budget || "-"}</span></div>
        <div class="field"><strong>客户备注</strong><span>${lead.note ? escapeHtml(lead.note) : "-"}</span></div>
        <div class="field"><strong>来源平台</strong><span>${lead.platform || "-"}</span></div>
        <div class="field"><strong>来源账号</strong><span>${lead.accountName || "-"}</span></div>
        <div class="field"><strong>来源作品</strong>
          <span>${lead.sourcePostUrl
            ? `<button class="ghost js-open-external" data-url="${escapeHtmlAttribute(lead.sourcePostUrl)}" type="button">${escapeHtml(lead.sourcePostTitle || "打开原帖")}</button>`
            : escapeHtml(lead.sourcePostTitle || "未关联作品")}</span>
        </div>
        <div class="field"><strong>所属运营</strong><span>${lead.employeeName || "-"}</span></div>
        <div class="field"><strong>添加方式</strong><span>${getAddMethodLabel(lead.addMethod)}</span></div>
        <div class="field"><strong>录入时间</strong><span>${lead.createdAt ? formatDate(lead.createdAt) : "-"}</span></div>
      </div>
    </section>
  `;

  const renderControlSection = () => `
    <section class="detail-section">
      <h3>状态控件</h3>
      <div class="detail-grid">
        <div class="field">
          <strong>意向度</strong>
          <select class="lead-chip-select js-lead-intention-level" data-id="${lead.id}">
            <option value="pending" ${intentionLevel === "pending" ? "selected" : ""}>待判断</option>
            <option value="high" ${intentionLevel === "high" ? "selected" : ""}>高意向</option>
            <option value="mid" ${intentionLevel === "mid" ? "selected" : ""}>中意向</option>
            <option value="low" ${intentionLevel === "low" ? "selected" : ""}>低意向</option>
            <option value="invalid" ${intentionLevel === "invalid" ? "selected" : ""}>无效</option>
          </select>
        </div>
        <div class="field">
          <strong>处理状态</strong>
          <select class="lead-chip-select js-lead-process-status" data-id="${lead.id}">
            <option value="not_contacted" ${processStatus === "not_contacted" ? "selected" : ""}>未联系</option>
            <option value="applied" ${processStatus === "applied" ? "selected" : ""}>已发送申请</option>
            <option value="pending" ${processStatus === "pending" ? "selected" : ""}>待通过</option>
            <option value="passed" ${processStatus === "passed" ? "selected" : ""}>已通过</option>
            <option value="chatting" ${processStatus === "chatting" ? "selected" : ""}>沟通中</option>
            <option value="quoted" ${processStatus === "quoted" ? "selected" : ""}>已报价</option>
            <option value="closed" ${processStatus === "closed" ? "selected" : ""}>已成交</option>
            <option value="invalid" ${processStatus === "invalid" ? "selected" : ""}>无效</option>
          </select>
        </div>
        <div class="field">
          <strong>添加状态</strong>
          <label class="lead-check-chip ${addStatusAdded ? "is-good" : ""}">
            <input class="js-sales-add-toggle" data-id="${lead.id}" type="checkbox" ${addStatusAdded ? "checked" : ""} />
            <span>${addStatusLabel}</span>
          </label>
        </div>
        <div class="field">
          <strong>下次跟进时间</strong>
          <input class="js-lead-next-follow" data-id="${lead.id}" type="datetime-local" value="${nextFollow}" />
        </div>
        <div class="field full-row">
          <strong>客户备注</strong>
          <form class="form-grid form-grid-tight js-lead-note-form">
            <input type="hidden" name="id" value="${lead.id}" />
            <textarea class="full" name="note" rows="3" placeholder="客资备注">${escapeHtml(lead.note || "")}</textarea>
            <div class="actions full">
              <button class="primary" type="submit">保存备注</button>
            </div>
          </form>
        </div>
      </div>
    </section>
  `;

  const renderTabBody = () => {
    if (tab === "timeline") {
      if (records === null) return `<div class="empty">加载中…</div>`;
      if (!records.length) return `<div class="empty">暂无跟进记录</div>`;
      return `
        <ul class="lead-timeline-list">
          ${records.map((r) => `
            <li class="lead-timeline-item">
              <div class="lead-timeline-meta">
                <strong>${r.createdAt ? formatDate(r.createdAt) : "-"}</strong>
                <span class="muted">${escapeHtml(r.followType || "微信")}</span>
              </div>
              <p>${escapeHtml(String(r.content || ""))}</p>
              ${r.nextFollowTime ? `<span class="muted">下次跟进：${formatNextFollowTime(r.nextFollowTime)}</span>` : ""}
            </li>
          `).join("")}
        </ul>
      `;
    }
    if (tab === "collab") {
      if (collabs === null) return `<div class="empty">加载中…</div>`;
      if (!collabs.length) return `<div class="empty">暂无该客资相关的协同申请。</div>`;
      return `
        <table class="table">
          <thead>
            <tr><th>协同类型</th><th>状态</th><th>处理人</th><th>申请时间</th><th>处理时间</th><th>原因</th></tr>
          </thead>
          <tbody>
            ${collabs.map((row) => {
              const handler = row.handlerId ? findOrderUserLabel(row.handlerId) : "-";
              return `
                <tr>
                  <td>${getCollabTypeLabel(row.type)}</td>
                  <td>${getCollabStatusLabel(row.status)}</td>
                  <td>${escapeHtml(handler)}</td>
                  <td>${row.requestedAt ? formatDate(row.requestedAt) : "-"}</td>
                  <td>${row.handledAt ? formatDate(row.handledAt) : "-"}</td>
                  <td>${escapeHtml(row.reason || "-")}</td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      `;
    }
    if (tab === "capture") {
      if (!lead.captureImageUrl) return `<div class="empty">该客资暂无来源截图。</div>`;
      return `
        <div>
          <button class="image-trigger image-trigger-inline js-open-image" data-src="${escapeHtmlAttribute(lead.captureImageUrl)}" type="button">
            <img class="cover-thumb" src="${escapeHtmlAttribute(lead.captureImageUrl)}" alt="来源截图" style="max-width:480px;" />
          </button>
        </div>
      `;
    }
    return "";
  };

  return `
    <div class="sales-lead-detail-page">
      <div class="page-header page-header-rich">
        <div>
          <h2>客资详情 · ${escapeHtml(lead.nickname || lead.contactInfo || "未命名客资")}</h2>
          <p class="page-desc">客资编号 ${formatLeadCode(lead.leadCode)}，结合状态、跟进时间线和协同记录进行下一步动作。</p>
        </div>
        <div class="toolbar toolbar-end">
          <button class="ghost js-back-sales-followups" type="button">返回跟进看板</button>
        </div>
      </div>
      ${renderInfoSection()}
      ${renderControlSection()}
      <section class="detail-section">
        <div class="detail-tabs">
          <button class="js-sales-lead-detail-tab ${tab === "timeline" ? "active" : ""}" data-tab="timeline" type="button">跟进时间线</button>
          <button class="js-sales-lead-detail-tab ${tab === "collab" ? "active" : ""}" data-tab="collab" type="button">协同记录</button>
          <button class="js-sales-lead-detail-tab ${tab === "capture" ? "active" : ""}" data-tab="capture" type="button">来源截图</button>
        </div>
        ${renderTabBody()}
      </section>
    </div>
  `;
}


// ===========================================================================
// 任务 2：销售订单跟进视图
// ===========================================================================
async function loadSalesOrders() {
  state.salesOrdersLoading = true;
  const params = new URLSearchParams();
  params.set("scope", "mine");
  if (state.user?.id) params.set("actorUserId", state.user.id);
  params.set("actorRole", "sales");
  if (state.salesOrdersFilter) params.set("status", state.salesOrdersFilter);
  try {
    const rows = await api(`/api/orders?${params.toString()}`);
    state.salesOrders = Array.isArray(rows) ? rows : [];
  } catch (err) {
    state.salesOrders = [];
  } finally {
    state.salesOrdersLoading = false;
    renderApp();
  }
}

function renderSalesOrders() {
  const tabs = [["", "全部"]].concat(ORDER_STATUS_OPTIONS.map((s) => [s, getOrderStatusLabel(s)]));
  const tabsHtml = tabs.map(([code, label]) => `
    <button class="js-sales-orders-tab ${state.salesOrdersFilter === code ? "active" : ""}" data-status="${code}" type="button">${label}</button>
  `).join("");
  return `
    <div class="sales-orders-page">
      <div class="page-header page-header-rich">
        <div>
          <h2>订单跟进</h2>
          <p class="page-desc">查看你标记成交的订单，按状态聚合，进入详情可以查看节点跟进时间线。</p>
        </div>
        <div class="toolbar toolbar-end">
          <button id="exportSalesOrdersBtn" type="button">导出 Excel</button>
        </div>
      </div>
      <div class="panel">
        <div class="order-status-tabs">${tabsHtml}</div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>订单 ID</th>
                <th>关联客资</th>
                <th>服务类型</th>
                <th>金额</th>
                <th>教务</th>
                <th>订单状态</th>
                <th>付款状态</th>
                <th>创建时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody id="salesOrdersTbody"><tr><td colspan="9"><div class="empty">加载中…</div></td></tr></tbody>
          </table>
        </div>
        <div id="salesOrdersPager" class="pag-container"></div>
      </div>
    </div>
  `;
}

// 渲染销售订单当前页 rows 到 tbody
function renderSalesOrdersTableBody(items) {
  const tbody = document.getElementById("salesOrdersTbody");
  if (!tbody) return;
  if (!items || !items.length) {
    tbody.innerHTML = `<tr><td colspan="9"><div class="empty">暂无符合条件的订单。</div></td></tr>`;
    return;
  }
  tbody.innerHTML = items.map((o) => {
    const lead = findLeadByIdLite(o.leadId);
    const leadCode = lead ? formatLeadCode(lead.leadCode) : (o.leadId || "-");
    const academicName = findOrderUserLabel(o.academicUserId);
    return `
      <tr class="js-sales-order-open" data-id="${escapeHtmlAttribute(o.id || "")}" style="cursor:pointer;">
        <td>${shortOrderId(o.id)}</td>
        <td>${leadCode}</td>
        <td>${escapeHtml(o.serviceType || "-")}</td>
        <td>${formatOrderAmount(o.amount)}</td>
        <td>${escapeHtml(academicName)}</td>
        <td>${getOrderStatusLabel(o.orderStatus)}</td>
        <td>${getPaidStatusLabel(o.paidStatus)}</td>
        <td>${o.createdAt ? formatDate(o.createdAt) : "-"}</td>
        <td><button class="ghost js-sales-order-open-btn" data-id="${escapeHtmlAttribute(o.id || "")}" type="button">详情</button></td>
      </tr>
    `;
  }).join("");
  // 重新绑定点击（列表 innerHTML 重写后旧绑定丢失）
  document.querySelectorAll("#salesOrdersTbody .js-sales-order-open").forEach((el) => el.addEventListener("click", (event) => {
    if (event.target.closest("button")) return;
    openSalesOrderDetail(el.dataset.id);
  }));
  document.querySelectorAll("#salesOrdersTbody .js-sales-order-open-btn").forEach((el) => el.addEventListener("click", (event) => {
    event.stopPropagation();
    openSalesOrderDetail(el.dataset.id);
  }));
}

// 给销售订单跟进挂分页器（renderApp 后由 bindOrdersViewsEvents 调用）
function mountSalesOrdersPagination() {
  if (typeof setupPagination !== "function") return;
  setupPagination("salesOrdersPager", {
    pageSize: 20,
    fetchPage: async (page, pageSize) => {
      const params = new URLSearchParams();
      params.set("scope", "mine");
      if (state.user?.id) params.set("actorUserId", state.user.id);
      params.set("actorRole", "sales");
      if (state.salesOrdersFilter) params.set("status", state.salesOrdersFilter);
      params.set("limit", String(pageSize));
      params.set("offset", String((page - 1) * pageSize));
      const res = await api(`/api/orders?${params.toString()}`);
      const items = Array.isArray(res?.items) ? res.items : (Array.isArray(res) ? res : []);
      const total = Number(res?.total ?? items.length);
      return { items, total };
    },
    renderItems: (items) => renderSalesOrdersTableBody(items),
  });
}

async function loadSalesOrderDetail(id) {
  if (!id) return;
  state.salesOrderDetailLoading = true;
  try {
    const [order, records] = await Promise.all([
      api(`/api/orders/${encodeURIComponent(id)}`).catch(() => null),
      api(`/api/orders/${encodeURIComponent(id)}/follow-records`).catch(() => [])
    ]);
    state.salesOrderDetail = order || null;
    state.salesOrderFollowRecords = Array.isArray(records) ? records : [];
  } finally {
    state.salesOrderDetailLoading = false;
    renderApp();
  }
}

function openSalesOrderDetail(id) {
  state.salesOrderDetailId = id;
  state.salesOrderDetail = null;
  state.salesOrderFollowRecords = null;
  state.currentView = "sales-order-detail";
  loadSalesOrderDetail(id);
  renderApp();
}

function backToSalesOrders() {
  state.currentView = "sales-orders";
  state.salesOrderDetailId = null;
  state.salesOrderDetail = null;
  state.salesOrderFollowRecords = null;
  renderApp();
}

function renderOrderTimelineSection(records, loading) {
  if (loading || records === null) return `<section class="detail-section"><h3>节点跟进时间线</h3><div class="empty">加载中…</div></section>`;
  if (!records.length) return `<section class="detail-section"><h3>节点跟进时间线</h3><div class="empty">暂无节点记录</div></section>`;
  return `
    <section class="detail-section">
      <h3>节点跟进时间线</h3>
      <ul class="lead-timeline-list">
        ${records.map((r) => `
          <li class="lead-timeline-item">
            <div class="lead-timeline-meta">
              <strong>${r.createdAt ? formatDate(r.createdAt) : "-"}</strong>
              <span class="muted">${escapeHtml(r.nodeType || "-")}</span>
            </div>
            <p>${escapeHtml(String(r.content || ""))}</p>
            ${r.nextRemindAt ? `<span class="muted">下次提醒：${formatNextFollowTime(r.nextRemindAt)}</span>` : ""}
          </li>
        `).join("")}
      </ul>
    </section>
  `;
}

function renderSalesOrderDetail() {
  const id = state.salesOrderDetailId;
  if (!id) return `<div class="empty">未选中订单。<button class="ghost js-back-sales-orders" type="button">返回订单列表</button></div>`;
  const order = state.salesOrderDetail;
  const records = state.salesOrderFollowRecords;
  if (state.salesOrderDetailLoading || order === null) {
    return `
      <div class="sales-order-detail-page">
        <div class="page-header page-header-rich">
          <div><h2>订单详情</h2><p class="page-desc">加载中…</p></div>
          <div class="toolbar toolbar-end">
            <button class="ghost js-back-sales-orders" type="button">返回订单列表</button>
          </div>
        </div>
      </div>
    `;
  }
  if (!order) {
    return `
      <div class="sales-order-detail-page">
        <div class="page-header page-header-rich">
          <div><h2>订单详情</h2><p class="page-desc">未找到订单，可能已被删除。</p></div>
          <div class="toolbar toolbar-end">
            <button class="ghost js-back-sales-orders" type="button">返回订单列表</button>
          </div>
        </div>
      </div>
    `;
  }
  const lead = findLeadByIdLite(order.leadId);
  const leadCode = lead ? formatLeadCode(lead.leadCode) : (order.leadId || "-");
  const academicName = findOrderUserLabel(order.academicUserId);
  return `
    <div class="sales-order-detail-page">
      <div class="page-header page-header-rich">
        <div>
          <h2>订单详情 · ${shortOrderId(order.id)}</h2>
          <p class="page-desc">该订单的基础信息、关联客资和教务负责人都在下方，跟进节点会同步反映给主管端。</p>
        </div>
        <div class="toolbar toolbar-end">
          <button class="ghost js-back-sales-orders" type="button">返回订单列表</button>
        </div>
      </div>
      <section class="detail-section">
        <h3>订单基础信息</h3>
        <div class="detail-grid">
          <div class="field"><strong>订单 ID</strong><span>${escapeHtml(String(order.id || "-"))}</span></div>
          <div class="field"><strong>订单状态</strong><span>${getOrderStatusLabel(order.orderStatus)}</span></div>
          <div class="field"><strong>付款状态</strong><span>${getPaidStatusLabel(order.paidStatus)}</span></div>
          <div class="field"><strong>服务类型</strong><span>${escapeHtml(order.serviceType || "-")}</span></div>
          <div class="field"><strong>金额</strong><span>${formatOrderAmount(order.amount)}</span></div>
          <div class="field"><strong>教务负责人</strong><span>${escapeHtml(academicName)}</span></div>
          <div class="field"><strong>关联客资</strong><span>${leadCode}</span></div>
          <div class="field"><strong>备注</strong><span>${escapeHtml(order.remark || "-")}</span></div>
          <div class="field"><strong>创建时间</strong><span>${order.createdAt ? formatDate(order.createdAt) : "-"}</span></div>
        </div>
      </section>
      ${renderOrderTimelineSection(records, state.salesOrderDetailLoading)}
    </div>
  `;
}


// ===========================================================================
// 任务 3：主管端订单看板
// ===========================================================================
// 注：列表数据走 paginationjs 分页器在 mount 后异步拉取，
// 渲染时不预先加载全量。保留 state.adminOrdersFilter 给筛选交互用。
function renderAdminOrders() {
  const f = state.adminOrdersFilter || {};
  const salesUsers = (state.users || []).filter((u) => u && u.role === "sales");
  const academicUsers = (state.users || []).filter((u) => u && u.role === "academic");

  return `
    <div class="admin-orders-page">
      <div class="page-header page-header-rich">
        <div>
          <h2>订单看板</h2>
          <p class="page-desc">汇总所有销售提交的成交订单，可按销售 / 教务 / 订单状态 / 付款状态 / 日期筛选。</p>
        </div>
        <div class="toolbar toolbar-end">
          <span class="tag" id="adminOrdersTotalTag">共 - 条</span>
          <button id="exportOrdersBtn" type="button">导出 Excel</button>
        </div>
      </div>
      <div class="panel">
        <div class="filters filters-toolbar">
          <select id="adminOrdersSalesFilter">
            <option value="">全部销售</option>
            ${salesUsers.map((u) => `<option value="${escapeHtmlAttribute(u.id || "")}" ${f.salesUserId === u.id ? "selected" : ""}>${escapeHtml(u.employeeName || u.username || u.id)}</option>`).join("")}
          </select>
          <select id="adminOrdersAcademicFilter">
            <option value="">全部教务</option>
            ${academicUsers.map((u) => `<option value="${escapeHtmlAttribute(u.id || "")}" ${f.academicUserId === u.id ? "selected" : ""}>${escapeHtml(u.employeeName || u.username || u.id)}</option>`).join("")}
          </select>
          <select id="adminOrdersStatusFilter">
            <option value="">全部订单状态</option>
            ${ORDER_STATUS_OPTIONS.map((s) => `<option value="${s}" ${f.orderStatus === s ? "selected" : ""}>${getOrderStatusLabel(s)}</option>`).join("")}
          </select>
          <select id="adminOrdersPaidFilter">
            <option value="">全部付款状态</option>
            ${PAID_STATUS_OPTIONS.map((s) => `<option value="${s}" ${f.paidStatus === s ? "selected" : ""}>${getPaidStatusLabel(s)}</option>`).join("")}
          </select>
          <input id="adminOrdersFromInput" type="date" value="${(f.from || "").slice(0, 10)}" placeholder="开始日期" />
          <input id="adminOrdersToInput" type="date" value="${(f.to || "").slice(0, 10)}" placeholder="结束日期" />
          <button class="ghost" id="adminOrdersClearBtn" type="button">清空筛选</button>
        </div>
      </div>
      <div class="panel">
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>订单 ID</th>
                <th>客资编号</th>
                <th>客户</th>
                <th>销售</th>
                <th>教务</th>
                <th>服务类型</th>
                <th>金额</th>
                <th>付款状态</th>
                <th>订单状态</th>
                <th>创建时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody id="adminOrdersTbody"><tr><td colspan="11"><div class="empty">加载中…</div></td></tr></tbody>
          </table>
        </div>
        <div id="adminOrdersPager" class="pag-container"></div>
      </div>
    </div>
  `;
}

// 渲染当前页 rows 到 tbody
function renderAdminOrdersTableBody(rows) {
  const tbody = document.getElementById("adminOrdersTbody");
  if (!tbody) return;
  if (!rows || !rows.length) {
    tbody.innerHTML = `<tr><td colspan="11"><div class="empty">暂无符合条件的订单。</div></td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map((o) => {
    const lead = findLeadByIdLite(o.leadId);
    const leadCode = lead ? formatLeadCode(lead.leadCode) : (o.leadId || "-");
    const customer = lead ? (lead.nickname || lead.contactInfo || "-") : "-";
    const salesName = findOrderUserLabel(o.salesUserId);
    const academicName = findOrderUserLabel(o.academicUserId);
    return `
      <tr class="js-admin-order-open" data-id="${escapeHtmlAttribute(o.id || "")}" style="cursor:pointer;">
        <td>${shortOrderId(o.id)}</td>
        <td>${leadCode}</td>
        <td>${escapeHtml(customer)}</td>
        <td>${escapeHtml(salesName)}</td>
        <td>${escapeHtml(academicName)}</td>
        <td>${escapeHtml(o.serviceType || "-")}</td>
        <td>${formatOrderAmount(o.amount)}</td>
        <td>${getPaidStatusLabel(o.paidStatus)}</td>
        <td>${getOrderStatusLabel(o.orderStatus)}</td>
        <td>${o.createdAt ? formatDate(o.createdAt) : "-"}</td>
        <td><button class="ghost js-admin-order-open-btn" data-id="${escapeHtmlAttribute(o.id || "")}" type="button">详情</button></td>
      </tr>
    `;
  }).join("");
  // 重新绑定点击（列表 innerHTML 重写后旧绑定丢失）
  document.querySelectorAll(".js-admin-order-open").forEach((el) => el.addEventListener("click", (e) => {
    if (e.target.closest("button")) return;
    openAdminOrderDetail(el.dataset.id);
  }));
  document.querySelectorAll(".js-admin-order-open-btn").forEach((el) => el.addEventListener("click", () => {
    openAdminOrderDetail(el.dataset.id);
  }));
}

// 给 admin 订单看板挂分页器（renderApp 后由 bindOrdersViewsEvents 调用）
function mountAdminOrdersPagination() {
  if (typeof setupPagination !== "function") return;
  setupPagination("adminOrdersPager", {
    pageSize: 20,
    fetchPage: async (page, pageSize) => {
      const params = new URLSearchParams();
      params.set("actorRole", "admin");
      params.set("scope", "all");
      if (state.user?.id) params.set("actorUserId", state.user.id);
      const f = state.adminOrdersFilter || {};
      if (f.orderStatus) params.set("status", f.orderStatus);
      if (f.salesUserId) params.set("salesUserId", f.salesUserId);
      if (f.academicUserId) params.set("academicUserId", f.academicUserId);
      if (f.paidStatus) params.set("paidStatus", f.paidStatus);
      if (f.from) params.set("from", f.from);
      if (f.to) params.set("to", f.to);
      params.set("limit", String(pageSize));
      params.set("offset", String((page - 1) * pageSize));
      const res = await api(`/api/orders?${params.toString()}`);
      // 后端 paged 返回 { items, total, limit, offset }
      const items = Array.isArray(res?.items) ? res.items : (Array.isArray(res) ? res : []);
      const total = Number(res?.total ?? items.length);
      // 同步顶部"共 N 条"
      const tag = document.getElementById("adminOrdersTotalTag");
      if (tag) tag.textContent = `共 ${total} 条`;
      return { items, total };
    },
    renderItems: (items) => renderAdminOrdersTableBody(items),
  });
}

async function loadAdminOrderDetail(id) {
  if (!id) return;
  state.adminOrderDetailLoading = true;
  try {
    const [order, records] = await Promise.all([
      api(`/api/orders/${encodeURIComponent(id)}`).catch(() => null),
      api(`/api/orders/${encodeURIComponent(id)}/follow-records`).catch(() => [])
    ]);
    state.adminOrderDetail = order || null;
    state.adminOrderFollowRecords = Array.isArray(records) ? records : [];
  } finally {
    state.adminOrderDetailLoading = false;
    renderApp();
  }
}

function openAdminOrderDetail(id) {
  state.adminOrderDetailId = id;
  state.adminOrderDetail = null;
  state.adminOrderFollowRecords = null;
  state.currentView = "admin-order-detail";
  loadAdminOrderDetail(id);
  renderApp();
}

function backToAdminOrders() {
  state.currentView = "orders";
  state.adminOrderDetailId = null;
  state.adminOrderDetail = null;
  state.adminOrderFollowRecords = null;
  renderApp();
}

async function adminAssignAcademic(orderId) {
  if (!orderId) return;
  const academicUserId = prompt("输入要分配的教务用户 ID（user.id）：", "");
  if (!academicUserId) return;
  try {
    await api(`/api/orders/${encodeURIComponent(orderId)}`, {
      method: "PATCH",
      body: JSON.stringify({ academic_user_id: academicUserId.trim() })
    });
    setFlash("success", "已分配教务", "订单已更新教务负责人。");
    await loadAdminOrderDetail(orderId);
    state.adminOrders = null;
  } catch (e) {
    setFlash("warn", "分配失败", e?.message || "请稍后重试");
    renderApp();
  }
}

function renderAdminOrderDetail() {
  const id = state.adminOrderDetailId;
  if (!id) return `<div class="empty">未选中订单。<button class="ghost js-back-admin-orders" type="button">返回订单看板</button></div>`;
  const order = state.adminOrderDetail;
  const records = state.adminOrderFollowRecords;
  if (state.adminOrderDetailLoading || order === null) {
    return `
      <div class="admin-orders-page">
        <div class="page-header page-header-rich">
          <div><h2>订单详情</h2><p class="page-desc">加载中…</p></div>
          <div class="toolbar toolbar-end">
            <button class="ghost js-back-admin-orders" type="button">返回订单看板</button>
          </div>
        </div>
      </div>
    `;
  }
  if (!order) {
    return `
      <div class="admin-orders-page">
        <div class="page-header page-header-rich">
          <div><h2>订单详情</h2><p class="page-desc">未找到订单。</p></div>
          <div class="toolbar toolbar-end">
            <button class="ghost js-back-admin-orders" type="button">返回订单看板</button>
          </div>
        </div>
      </div>
    `;
  }
  const lead = findLeadByIdLite(order.leadId);
  const leadCode = lead ? formatLeadCode(lead.leadCode) : (order.leadId || "-");
  const salesName = findOrderUserLabel(order.salesUserId);
  const academicName = findOrderUserLabel(order.academicUserId);
  return `
    <div class="admin-orders-page">
      <div class="page-header page-header-rich">
        <div>
          <h2>订单详情 · ${shortOrderId(order.id)}</h2>
          <p class="page-desc">主管视角：可重新分配教务负责人，查看节点跟进时间线。</p>
        </div>
        <div class="toolbar toolbar-end">
          <button class="primary js-admin-assign-academic" data-id="${escapeHtmlAttribute(order.id)}" type="button">分配教务</button>
          <button class="ghost js-back-admin-orders" type="button">返回订单看板</button>
        </div>
      </div>
      <section class="detail-section">
        <h3>订单基础信息</h3>
        <div class="detail-grid">
          <div class="field"><strong>订单 ID</strong><span>${escapeHtml(String(order.id || "-"))}</span></div>
          <div class="field"><strong>订单状态</strong><span>${getOrderStatusLabel(order.orderStatus)}</span></div>
          <div class="field"><strong>付款状态</strong><span>${getPaidStatusLabel(order.paidStatus)}</span></div>
          <div class="field"><strong>服务类型</strong><span>${escapeHtml(order.serviceType || "-")}</span></div>
          <div class="field"><strong>金额</strong><span>${formatOrderAmount(order.amount)}</span></div>
          <div class="field"><strong>销售</strong><span>${escapeHtml(salesName)}</span></div>
          <div class="field"><strong>教务负责人</strong><span>${escapeHtml(academicName)}</span></div>
          <div class="field"><strong>关联客资</strong><span>${leadCode}</span></div>
          <div class="field"><strong>备注</strong><span>${escapeHtml(order.remark || "-")}</span></div>
          <div class="field"><strong>创建时间</strong><span>${order.createdAt ? formatDate(order.createdAt) : "-"}</span></div>
        </div>
      </section>
      ${renderOrderTimelineSection(records, state.adminOrderDetailLoading)}
    </div>
  `;
}


// ===========================================================================
// 任务 4：教务端 — 订单池 + 详情 + 异常订单
// ===========================================================================
async function loadAcademicOrders() {
  state.academicOrdersLoading = true;
  const params = new URLSearchParams();
  params.set("role", "academic");
  params.set("actorRole", "academic");
  if (state.user?.id) params.set("actorUserId", state.user.id);
  const scope = state.academicOrdersScope || "mine";
  params.set("scope", scope);
  if (state.academicOrdersFilter) params.set("status", state.academicOrdersFilter);
  try {
    const rows = await api(`/api/orders?${params.toString()}`);
    state.academicOrders = Array.isArray(rows) ? rows : [];
  } catch (err) {
    state.academicOrders = [];
  } finally {
    state.academicOrdersLoading = false;
    renderApp();
  }
}

function renderAcademicOrders() {
  const tabs = [["", "全部"]].concat(
    ["to_receive", "in_progress", "awaiting_client_info", "awaiting_teacher", "to_deliver", "completed"]
      .map((s) => [s, getOrderStatusLabel(s)])
  );
  const tabsHtml = tabs.map(([code, label]) => `
    <button class="js-academic-orders-tab ${state.academicOrdersFilter === code ? "active" : ""}" data-status="${code}" type="button">${label}</button>
  `).join("");
  const scope = state.academicOrdersScope || "mine";

  return `
    <div class="academic-orders-page">
      <div class="page-header page-header-rich">
        <div>
          <h2>订单池</h2>
          <p class="page-desc">销售标记成交后，订单会进入这里。先按"全部"领取，然后切到"我领取的"跟进。</p>
        </div>
        <div class="toolbar toolbar-end">
          <button id="exportAcademicOrdersBtn" type="button">导出 Excel</button>
        </div>
      </div>
      <div class="panel">
        <div class="filters filters-toolbar">
          <button class="js-academic-scope ${scope === "mine" ? "active primary" : "ghost"}" data-scope="mine" type="button">我领取的</button>
          <button class="js-academic-scope ${scope === "all" ? "active primary" : "ghost"}" data-scope="all" type="button">全部</button>
        </div>
        <div class="order-status-tabs">${tabsHtml}</div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>订单 ID</th>
                <th>关联客资</th>
                <th>销售</th>
                <th>服务类型</th>
                <th>金额</th>
                <th>订单状态</th>
                <th>付款状态</th>
                <th>创建时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody id="academicOrdersTbody"><tr><td colspan="9"><div class="empty">加载中…</div></td></tr></tbody>
          </table>
        </div>
        <div id="academicOrdersPager" class="pag-container"></div>
      </div>
    </div>
  `;
}

// 渲染教务订单当前页 rows 到 tbody
function renderAcademicOrdersTableBody(items) {
  const tbody = document.getElementById("academicOrdersTbody");
  if (!tbody) return;
  if (!items || !items.length) {
    tbody.innerHTML = `<tr><td colspan="9"><div class="empty">暂无符合条件的订单。</div></td></tr>`;
    return;
  }
  tbody.innerHTML = items.map((o) => {
    const canClaim = !o.academicUserId;
    const salesName = findOrderUserLabel(o.salesUserId);
    return `
      <tr class="js-academic-order-open" data-id="${escapeHtmlAttribute(o.id || "")}" style="cursor:pointer;">
        <td>${shortOrderId(o.id)}</td>
        <td>${escapeHtml(o.leadId || "-")}</td>
        <td>${escapeHtml(salesName)}</td>
        <td>${escapeHtml(o.serviceType || "-")}</td>
        <td>${formatOrderAmount(o.amount)}</td>
        <td>${getOrderStatusLabel(o.orderStatus)}</td>
        <td>${getPaidStatusLabel(o.paidStatus)}</td>
        <td>${o.createdAt ? formatDate(o.createdAt) : "-"}</td>
        <td>
          ${canClaim ? `<button class="primary js-academic-claim-order" data-id="${escapeHtmlAttribute(o.id || "")}" type="button">领取</button> ` : ""}
          <button class="ghost js-academic-order-open-btn" data-id="${escapeHtmlAttribute(o.id || "")}" type="button">详情</button>
        </td>
      </tr>
    `;
  }).join("");
  // 重新绑定点击（列表 innerHTML 重写后旧绑定丢失）
  document.querySelectorAll("#academicOrdersTbody .js-academic-order-open").forEach((el) => el.addEventListener("click", (event) => {
    if (event.target.closest("button")) return;
    openAcademicOrderDetail(el.dataset.id);
  }));
  document.querySelectorAll("#academicOrdersTbody .js-academic-order-open-btn").forEach((el) => el.addEventListener("click", (event) => {
    event.stopPropagation();
    openAcademicOrderDetail(el.dataset.id);
  }));
  document.querySelectorAll("#academicOrdersTbody .js-academic-claim-order").forEach((el) => el.addEventListener("click", (event) => {
    event.stopPropagation();
    academicClaimOrder(el.dataset.id);
  }));
}

// 给教务端订单池挂分页器（renderApp 后由 bindOrdersViewsEvents 调用）
function mountAcademicOrdersPagination() {
  if (typeof setupPagination !== "function") return;
  setupPagination("academicOrdersPager", {
    pageSize: 20,
    fetchPage: async (page, pageSize) => {
      const params = new URLSearchParams();
      params.set("role", "academic");
      params.set("actorUserId", state.user?.id || "");
      params.set("actorRole", "academic");
      params.set("scope", state.academicOrdersScope || "mine");
      if (state.academicOrdersFilter) params.set("status", state.academicOrdersFilter);
      params.set("limit", String(pageSize));
      params.set("offset", String((page - 1) * pageSize));
      const res = await api(`/api/orders?${params.toString()}`);
      const items = Array.isArray(res?.items) ? res.items : (Array.isArray(res) ? res : []);
      const total = Number(res?.total ?? items.length);
      return { items, total };
    },
    renderItems: (items) => renderAcademicOrdersTableBody(items),
  });
}

async function academicClaimOrder(orderId) {
  if (!orderId) return;
  if (!state.user?.id) {
    setFlash("warn", "未登录", "请重新登录后再试。");
    renderApp();
    return;
  }
  try {
    await api(`/api/orders/${encodeURIComponent(orderId)}`, {
      method: "PATCH",
      body: JSON.stringify({ academic_user_id: state.user.id })
    });
    setFlash("success", "已领取订单", "订单已分配给你。");
    state.academicOrders = null;
    renderApp();
  } catch (e) {
    setFlash("warn", "领取失败", e?.message || "请稍后重试");
    renderApp();
  }
}

async function loadAcademicOrderDetail(id) {
  if (!id) return;
  state.academicOrderDetailLoading = true;
  try {
    const [order, records] = await Promise.all([
      api(`/api/orders/${encodeURIComponent(id)}`).catch(() => null),
      api(`/api/orders/${encodeURIComponent(id)}/follow-records`).catch(() => [])
    ]);
    state.academicOrderDetail = order || null;
    state.academicOrderFollowRecords = Array.isArray(records) ? records : [];
  } finally {
    state.academicOrderDetailLoading = false;
    renderApp();
  }
}

function openAcademicOrderDetail(id) {
  state.academicOrderDetailId = id;
  state.academicOrderDetail = null;
  state.academicOrderFollowRecords = null;
  state.currentView = "academic-order-detail";
  loadAcademicOrderDetail(id);
  renderApp();
}

function backToAcademicOrders() {
  state.currentView = "academic-orders";
  state.academicOrderDetailId = null;
  state.academicOrderDetail = null;
  state.academicOrderFollowRecords = null;
  renderApp();
}

async function academicUpdateOrderStatus(orderId, status) {
  if (!orderId || !status) return;
  try {
    await api(`/api/orders/${encodeURIComponent(orderId)}`, {
      method: "PATCH",
      body: JSON.stringify({ order_status: status })
    });
    setFlash("success", "订单状态已更新", "");
    await loadAcademicOrderDetail(orderId);
    state.academicOrders = null;
  } catch (e) {
    setFlash("warn", "更新失败", e?.message || "请稍后重试");
    renderApp();
  }
}

async function academicUpdatePaidStatus(orderId, paid) {
  if (!orderId || !paid) return;
  try {
    await api(`/api/orders/${encodeURIComponent(orderId)}`, {
      method: "PATCH",
      body: JSON.stringify({ paid_status: paid })
    });
    setFlash("success", "付款状态已更新", "");
    await loadAcademicOrderDetail(orderId);
    state.academicOrders = null;
  } catch (e) {
    setFlash("warn", "更新失败", e?.message || "请稍后重试");
    renderApp();
  }
}

async function academicAddFollowNode(orderId) {
  if (!orderId) return;
  const nodeType = prompt("节点类型（例如：collect_info / arrange_teacher / deliver / abnormal）：", "collect_info");
  if (!nodeType) return;
  const content = prompt("节点说明：", "") || "";
  const nextRemindAt = prompt("下次提醒时间（YYYY-MM-DD HH:MM，可填空）：", "") || "";
  try {
    await api(`/api/orders/${encodeURIComponent(orderId)}/follow-records`, {
      method: "POST",
      body: JSON.stringify({
        nodeType,
        content,
        nextRemindAt: nextRemindAt || null,
        actorUserId: state.user?.id || ""
      })
    });
    setFlash("success", "节点已新增", "时间线已更新。");
    await loadAcademicOrderDetail(orderId);
  } catch (e) {
    setFlash("warn", "新增失败", e?.message || "请稍后重试");
    renderApp();
  }
}

function renderAcademicOrderDetail() {
  const id = state.academicOrderDetailId;
  if (!id) return `<div class="empty">未选中订单。<button class="ghost js-back-academic-orders" type="button">返回订单池</button></div>`;
  const order = state.academicOrderDetail;
  const records = state.academicOrderFollowRecords;
  if (state.academicOrderDetailLoading || order === null) {
    return `
      <div class="academic-orders-page">
        <div class="page-header page-header-rich">
          <div><h2>订单详情</h2><p class="page-desc">加载中…</p></div>
          <div class="toolbar toolbar-end">
            <button class="ghost js-back-academic-orders" type="button">返回订单池</button>
          </div>
        </div>
      </div>
    `;
  }
  if (!order) {
    return `
      <div class="academic-orders-page">
        <div class="page-header page-header-rich">
          <div><h2>订单详情</h2><p class="page-desc">未找到订单。</p></div>
          <div class="toolbar toolbar-end">
            <button class="ghost js-back-academic-orders" type="button">返回订单池</button>
          </div>
        </div>
      </div>
    `;
  }
  const salesName = findOrderUserLabel(order.salesUserId);
  return `
    <div class="academic-orders-page">
      <div class="page-header page-header-rich">
        <div>
          <h2>订单详情 · ${shortOrderId(order.id)}</h2>
          <p class="page-desc">在这里调整订单状态、付款状态，记录交付节点。</p>
        </div>
        <div class="toolbar toolbar-end">
          <button class="ghost js-back-academic-orders" type="button">返回订单池</button>
        </div>
      </div>
      <section class="detail-section">
        <h3>客户与销售</h3>
        <div class="detail-grid">
          <div class="field"><strong>关联客资 ID</strong><span>${escapeHtml(order.leadId || "-")}</span></div>
          <div class="field"><strong>销售</strong><span>${escapeHtml(salesName)}</span></div>
          <div class="field"><strong>创建时间</strong><span>${order.createdAt ? formatDate(order.createdAt) : "-"}</span></div>
        </div>
      </section>
      <section class="detail-section">
        <h3>服务信息</h3>
        <div class="detail-grid">
          <div class="field"><strong>服务类型</strong><span>${escapeHtml(order.serviceType || "-")}</span></div>
          <div class="field"><strong>金额</strong><span>${formatOrderAmount(order.amount)}</span></div>
          <div class="field"><strong>当前订单状态</strong><span>${getOrderStatusLabel(order.orderStatus)}</span></div>
          <div class="field"><strong>当前付款状态</strong><span>${getPaidStatusLabel(order.paidStatus)}</span></div>
          <div class="field">
            <strong>更新订单状态</strong>
            <select class="js-academic-order-status" data-id="${escapeHtmlAttribute(order.id)}">
              ${ORDER_STATUS_OPTIONS.map((s) => `<option value="${s}" ${order.orderStatus === s ? "selected" : ""}>${getOrderStatusLabel(s)}</option>`).join("")}
            </select>
          </div>
          <div class="field">
            <strong>更新付款状态</strong>
            <select class="js-academic-paid-status" data-id="${escapeHtmlAttribute(order.id)}">
              ${PAID_STATUS_OPTIONS.map((s) => `<option value="${s}" ${order.paidStatus === s ? "selected" : ""}>${getPaidStatusLabel(s)}</option>`).join("")}
            </select>
          </div>
          <div class="field"><strong>备注</strong><span>${escapeHtml(order.remark || "-")}</span></div>
        </div>
      </section>
      <section class="detail-section">
        <div class="section-head" style="display:flex;justify-content:space-between;align-items:center;">
          <h3 style="margin:0;">节点跟进时间线</h3>
          <button class="primary js-academic-add-node" data-id="${escapeHtmlAttribute(order.id)}" type="button">新增节点</button>
        </div>
        ${records === null || state.academicOrderDetailLoading
          ? `<div class="empty">加载中…</div>`
          : records.length
            ? `
              <ul class="lead-timeline-list">
                ${records.map((r) => `
                  <li class="lead-timeline-item">
                    <div class="lead-timeline-meta">
                      <strong>${r.createdAt ? formatDate(r.createdAt) : "-"}</strong>
                      <span class="muted">${escapeHtml(r.nodeType || "-")}</span>
                    </div>
                    <p>${escapeHtml(String(r.content || ""))}</p>
                    ${r.nextRemindAt ? `<span class="muted">下次提醒：${formatNextFollowTime(r.nextRemindAt)}</span>` : ""}
                  </li>
                `).join("")}
              </ul>
            `
            : `<div class="empty">暂无节点记录</div>`}
      </section>
    </div>
  `;
}

async function loadAcademicAbnormalOrders() {
  state.academicAbnormalLoading = true;
  const params = new URLSearchParams();
  params.set("role", "academic");
  params.set("actorRole", "academic");
  if (state.user?.id) params.set("actorUserId", state.user.id);
  params.set("status", "abnormal");
  try {
    const rows = await api(`/api/orders?${params.toString()}`);
    state.academicAbnormalOrders = Array.isArray(rows) ? rows : [];
  } catch (err) {
    state.academicAbnormalOrders = [];
  } finally {
    state.academicAbnormalLoading = false;
    renderApp();
  }
}

function renderAcademicAbnormal() {
  if (state.academicAbnormalOrders === null && !state.academicAbnormalLoading) {
    loadAcademicAbnormalOrders();
  }
  const rows = Array.isArray(state.academicAbnormalOrders) ? state.academicAbnormalOrders : null;
  let body;
  if (rows === null) {
    body = `<tr><td colspan="7"><div class="empty">加载中…</div></td></tr>`;
  } else if (!rows.length) {
    body = `<tr><td colspan="7"><div class="empty">当前没有异常订单。</div></td></tr>`;
  } else {
    body = rows.map((o) => {
      const salesName = findOrderUserLabel(o.salesUserId);
      return `
        <tr>
          <td>${shortOrderId(o.id)}</td>
          <td>${escapeHtml(o.leadId || "-")}</td>
          <td>${escapeHtml(salesName)}</td>
          <td>${escapeHtml(o.serviceType || "-")}</td>
          <td>${formatOrderAmount(o.amount)}</td>
          <td>${o.createdAt ? formatDate(o.createdAt) : "-"}</td>
          <td>
            <button class="primary js-academic-resolve-abnormal" data-id="${escapeHtmlAttribute(o.id)}" type="button">标记处理完成</button>
            <button class="ghost js-academic-order-open" data-id="${escapeHtmlAttribute(o.id)}" type="button">查看详情</button>
          </td>
        </tr>
      `;
    }).join("");
  }
  return `
    <div class="academic-orders-page">
      <div class="page-header page-header-rich">
        <div>
          <h2>异常订单</h2>
          <p class="page-desc">所有标记为异常状态的订单集中在这里，处理完成后切回"进行中"，状态会同步给销售和主管。</p>
        </div>
      </div>
      <div class="panel">
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>订单 ID</th>
                <th>关联客资</th>
                <th>销售</th>
                <th>服务类型</th>
                <th>金额</th>
                <th>创建时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>${body}</tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

async function academicResolveAbnormal(orderId) {
  if (!orderId) return;
  if (!confirm("确认将此订单恢复为\"进行中\"？")) return;
  try {
    await api(`/api/orders/${encodeURIComponent(orderId)}`, {
      method: "PATCH",
      body: JSON.stringify({ order_status: "in_progress" })
    });
    setFlash("success", "已处理完成", "订单已恢复为进行中。");
    state.academicAbnormalOrders = null;
    renderApp();
  } catch (e) {
    setFlash("warn", "处理失败", e?.message || "请稍后重试");
    renderApp();
  }
}


// ===========================================================================
// 任务 5：导出按钮触发
// ===========================================================================
async function triggerExport(exportType) {
  let filter = {};
  if (exportType === "leads") {
    filter = {
      accountId: state.leadMonitorAccountFilter || "",
      platform: state.leadMonitorPlatformFilter || "",
      status: state.leadMonitorStatusFilter || "",
      addStatus: state.leadMonitorAddStatusFilter || "",
      employeeId: state.leadMonitorEmployeeFilter || "",
      postType: state.leadMonitorPostTypeFilter || "",
      mode: state.leadMonitorMode || "day",
      date: state.leadMonitorDate || "",
      week: state.leadMonitorWeek || ""
    };
  } else if (exportType === "orders") {
    const role = state.user?.role || "";
    if (role === "academic") {
      filter = {
        scope: state.academicOrdersScope || "mine",
        status: state.academicOrdersFilter || ""
      };
    } else if (role === "sales") {
      filter = {
        scope: "mine",
        status: state.salesOrdersFilter || ""
      };
    } else {
      filter = { scope: "all", ...(state.adminOrdersFilter || {}) };
    }
  } else if (exportType === "collaboration_records") {
    filter = {
      scope: state.collabTasksScope || "inbox",
      status: state.collabTabFilter || ""
    };
  }
  try {
    await api("/api/exports", {
      method: "POST",
      body: JSON.stringify({
        exportType,
        filter,
        actorUserId: state.user?.id || "",
        actorRole: state.user?.role || ""
      })
    });
    setFlash("success", "导出任务已创建", "完成后会在消息中心提供下载链接。");
  } catch (e) {
    setFlash("warn", "导出失败", e?.message || "请稍后重试");
  }
  renderApp();
}


// ===========================================================================
// 事件绑定（在 bindViewEvents 末尾调用）
// ===========================================================================
function bindOrdersViewsEvents() {
  // 进入 admin 订单看板时挂分页器（需要等待 DOM 准备好）
  if (state.currentView === "orders" && document.getElementById("adminOrdersPager")) {
    if (typeof mountAdminOrdersPagination === "function") {
      mountAdminOrdersPagination();
    }
  }
  if (state.currentView === "sales-orders" && document.getElementById("salesOrdersPager")) {
    mountSalesOrdersPagination();
  }
  if (state.currentView === "academic-orders" && document.getElementById("academicOrdersPager")) {
    mountAcademicOrdersPagination();
  }

  // T-L6 销售客资详情：入口（在跟进卡片中绑定）+ 返回 + tab
  document.querySelectorAll(".js-sales-view-detail").forEach((el) => el.addEventListener("click", () => openSalesLeadDetail(el.dataset.id)));
  document.querySelectorAll(".js-back-sales-followups").forEach((el) => el.addEventListener("click", backToSalesFollowups));
  document.querySelectorAll(".js-sales-lead-detail-tab").forEach((el) => el.addEventListener("click", () => {
    state.salesLeadDetailTab = el.dataset.tab || "timeline";
    renderApp();
  }));

  // 销售订单跟进
  document.querySelectorAll(".js-sales-orders-tab").forEach((el) => el.addEventListener("click", () => {
    state.salesOrdersFilter = el.dataset.status || "";
    document.querySelectorAll(".js-sales-orders-tab").forEach((b) => b.classList.toggle("active", b === el));
    refreshPagination("salesOrdersPager");
  }));
  document.querySelectorAll(".js-sales-order-open").forEach((el) => {
    el.addEventListener("click", (event) => {
      // 避免重复触发：内部按钮点击时同样进入详情
      if (event.target.closest("button") && event.target.closest("button") !== el) return;
      openSalesOrderDetail(el.dataset.id);
    });
  });
  document.querySelectorAll(".js-back-sales-orders").forEach((el) => el.addEventListener("click", backToSalesOrders));

  // 主管端订单看板
  document.getElementById("adminOrdersSalesFilter")?.addEventListener("change", (event) => {
    state.adminOrdersFilter = { ...(state.adminOrdersFilter || {}), salesUserId: event.target.value || "" };
    refreshPagination("adminOrdersPager");
  });
  document.getElementById("adminOrdersAcademicFilter")?.addEventListener("change", (event) => {
    state.adminOrdersFilter = { ...(state.adminOrdersFilter || {}), academicUserId: event.target.value || "" };
    refreshPagination("adminOrdersPager");
  });
  document.getElementById("adminOrdersStatusFilter")?.addEventListener("change", (event) => {
    state.adminOrdersFilter = { ...(state.adminOrdersFilter || {}), orderStatus: event.target.value || "" };
    refreshPagination("adminOrdersPager");
  });
  document.getElementById("adminOrdersPaidFilter")?.addEventListener("change", (event) => {
    state.adminOrdersFilter = { ...(state.adminOrdersFilter || {}), paidStatus: event.target.value || "" };
    refreshPagination("adminOrdersPager");
  });
  document.getElementById("adminOrdersFromInput")?.addEventListener("change", (event) => {
    state.adminOrdersFilter = { ...(state.adminOrdersFilter || {}), from: event.target.value || "" };
    refreshPagination("adminOrdersPager");
  });
  document.getElementById("adminOrdersToInput")?.addEventListener("change", (event) => {
    state.adminOrdersFilter = { ...(state.adminOrdersFilter || {}), to: event.target.value || "" };
    refreshPagination("adminOrdersPager");
  });
  document.getElementById("adminOrdersClearBtn")?.addEventListener("click", () => {
    state.adminOrdersFilter = { salesUserId: "", academicUserId: "", orderStatus: "", paidStatus: "", from: "", to: "" };
    renderApp();  // 清空筛选要重置 select 显示态，所以整页重渲
  });
  document.querySelectorAll(".js-admin-order-open").forEach((el) => {
    el.addEventListener("click", (event) => {
      if (event.target.closest("button")) return;  // 点击按钮时不触发行
      openAdminOrderDetail(el.dataset.id);
    });
  });
  document.querySelectorAll(".js-admin-order-open-btn").forEach((el) => el.addEventListener("click", (event) => {
    event.stopPropagation();
    openAdminOrderDetail(el.dataset.id);
  }));
  document.querySelectorAll(".js-back-admin-orders").forEach((el) => el.addEventListener("click", backToAdminOrders));
  document.querySelectorAll(".js-admin-assign-academic").forEach((el) => el.addEventListener("click", () => adminAssignAcademic(el.dataset.id)));

  // 教务端订单池
  document.querySelectorAll(".js-academic-scope").forEach((el) => el.addEventListener("click", () => {
    state.academicOrdersScope = el.dataset.scope || "mine";
    document.querySelectorAll(".js-academic-scope").forEach((b) => {
      const isActive = b === el;
      b.classList.toggle("active", isActive);
      b.classList.toggle("primary", isActive);
      b.classList.toggle("ghost", !isActive);
    });
    refreshPagination("academicOrdersPager");
  }));
  document.querySelectorAll(".js-academic-orders-tab").forEach((el) => el.addEventListener("click", () => {
    state.academicOrdersFilter = el.dataset.status || "";
    document.querySelectorAll(".js-academic-orders-tab").forEach((b) => b.classList.toggle("active", b === el));
    refreshPagination("academicOrdersPager");
  }));
  document.querySelectorAll(".js-academic-claim-order").forEach((el) => el.addEventListener("click", (event) => {
    event.stopPropagation();
    academicClaimOrder(el.dataset.id);
  }));
  document.querySelectorAll(".js-academic-order-open").forEach((el) => el.addEventListener("click", (event) => {
    event.stopPropagation();
    openAcademicOrderDetail(el.dataset.id);
  }));
  document.querySelectorAll(".js-back-academic-orders").forEach((el) => el.addEventListener("click", backToAcademicOrders));
  document.querySelectorAll(".js-academic-order-status").forEach((el) => el.addEventListener("change", () => academicUpdateOrderStatus(el.dataset.id, el.value)));
  document.querySelectorAll(".js-academic-paid-status").forEach((el) => el.addEventListener("change", () => academicUpdatePaidStatus(el.dataset.id, el.value)));
  document.querySelectorAll(".js-academic-add-node").forEach((el) => el.addEventListener("click", () => academicAddFollowNode(el.dataset.id)));
  document.querySelectorAll(".js-academic-resolve-abnormal").forEach((el) => el.addEventListener("click", () => academicResolveAbnormal(el.dataset.id)));

  // 导出按钮
  document.getElementById("exportLeadsBtn")?.addEventListener("click", () => triggerExport("leads"));
  document.getElementById("exportOrdersBtn")?.addEventListener("click", () => triggerExport("orders"));
  document.getElementById("exportSalesOrdersBtn")?.addEventListener("click", () => triggerExport("orders"));
  document.getElementById("exportAcademicOrdersBtn")?.addEventListener("click", () => triggerExport("orders"));
  document.getElementById("exportCollabsBtn")?.addEventListener("click", () => triggerExport("collaboration_records"));
}
