// academic-portal.js — 教务端完整功能
// 包含：订单池、订单详情、进度跟进、节点提醒、异常反馈
// 全局挂载，不使用 import/export

// ===========================================================================
// 教务端订单池视图
// ===========================================================================
async function loadAcademicOrders() {
  if (!state.user || state.user.role !== 'academic') return;
  state.academicOrdersLoading = true;
  try {
    const params = new URLSearchParams({
      role: 'academic',
      scope: state.academicOrderScope || 'mine',
      limit: String(state.academicOrderLimit || 20),
      offset: String(state.academicOrderOffset || 0)
    });
    if (state.academicOrderStatusFilter) {
      params.append('status', state.academicOrderStatusFilter);
    }
    const result = await api(`/api/orders?${params}`);
    if (result && result.items) {
      state.academicOrders = result.items;
      state.academicOrdersTotal = result.total || 0;
    } else {
      state.academicOrders = Array.isArray(result) ? result : [];
      state.academicOrdersTotal = state.academicOrders.length;
    }
  } catch (err) {
    console.error('[academic] load orders failed', err);
    state.academicOrders = [];
    state.academicOrdersTotal = 0;
  } finally {
    state.academicOrdersLoading = false;
    renderApp();
  }
}

function renderAcademicOrderPool() {
  const orders = state.academicOrders || [];
  const loading = state.academicOrdersLoading;
  const statusFilter = state.academicOrderStatusFilter || '';
  const scope = state.academicOrderScope || 'mine';

  return `
    <div class="academic-order-pool">
      <div class="page-header">
        <h2>订单池</h2>
        <div class="header-actions">
          <button onclick="refreshAcademicOrders()" class="btn-secondary">刷新</button>
        </div>
      </div>

      <div class="filter-bar">
        <div class="filter-group">
          <label>状态筛选：</label>
          <select onchange="setAcademicOrderStatusFilter(this.value)" ${loading ? 'disabled' : ''}>
            <option value="" ${!statusFilter ? 'selected' : ''}>全部</option>
            <option value="to_receive" ${statusFilter === 'to_receive' ? 'selected' : ''}>待接收</option>
            <option value="in_progress" ${statusFilter === 'in_progress' ? 'selected' : ''}>进行中</option>
            <option value="awaiting_client_info" ${statusFilter === 'awaiting_client_info' ? 'selected' : ''}>待客户资料</option>
            <option value="awaiting_teacher" ${statusFilter === 'awaiting_teacher' ? 'selected' : ''}>待老师安排</option>
            <option value="to_deliver" ${statusFilter === 'to_deliver' ? 'selected' : ''}>待交付</option>
            <option value="completed" ${statusFilter === 'completed' ? 'selected' : ''}>已完成</option>
            <option value="abnormal" ${statusFilter === 'abnormal' ? 'selected' : ''}>异常</option>
          </select>
        </div>
        <div class="filter-group">
          <label>范围：</label>
          <select onchange="setAcademicOrderScope(this.value)" ${loading ? 'disabled' : ''}>
            <option value="mine" ${scope === 'mine' ? 'selected' : ''}>我的订单</option>
            <option value="all" ${scope === 'all' ? 'selected' : ''}>全部订单</option>
          </select>
        </div>
      </div>

      ${loading ? '<div class="loading-spinner">加载中...</div>' : ''}
      ${!loading && orders.length === 0 ? '<div class="empty-state">暂无订单</div>' : ''}
      ${!loading && orders.length > 0 ? `
        <div class="orders-table-wrapper">
          <table class="data-table">
            <thead>
              <tr>
                <th>订单ID</th>
                <th>客资</th>
                <th>服务类型</th>
                <th>金额</th>
                <th>付款状态</th>
                <th>订单状态</th>
                <th>销售</th>
                <th>教务</th>
                <th>创建时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              ${orders.map(order => renderAcademicOrderRow(order)).join('')}
            </tbody>
          </table>
        </div>
        ${renderAcademicOrderPagination()}
      ` : ''}
    </div>
  `;
}

function renderAcademicOrderRow(order) {
  const lead = findLeadByIdLite(order.leadId);
  const salesLabel = findOrderUserLabel(order.salesUserId);
  const academicLabel = findOrderUserLabel(order.academicUserId);

  return `
    <tr>
      <td>${shortOrderId(order.id)}</td>
      <td>${lead?.contactInfo || lead?.nickname || '-'}</td>
      <td>${order.serviceType || '-'}</td>
      <td>${formatOrderAmount(order.amount)}</td>
      <td><span class="status-badge status-${order.paidStatus}">${getPaidStatusLabel(order.paidStatus)}</span></td>
      <td><span class="status-badge status-${order.orderStatus}">${getOrderStatusLabel(order.orderStatus)}</span></td>
      <td>${salesLabel}</td>
      <td>${academicLabel || '未分配'}</td>
      <td>${formatDateTime(order.createdAt)}</td>
      <td>
        <button onclick="openAcademicOrderDetail('${order.id}')" class="btn-link">详情</button>
        ${order.orderStatus === 'to_receive' && !order.academicUserId ?
          `<button onclick="receiveOrder('${order.id}')" class="btn-link">接单</button>` : ''}
      </td>
    </tr>
  `;
}

function renderAcademicOrderPagination() {
  const total = state.academicOrdersTotal || 0;
  const limit = state.academicOrderLimit || 20;
  const offset = state.academicOrderOffset || 0;
  const currentPage = Math.floor(offset / limit) + 1;
  const totalPages = Math.ceil(total / limit);

  if (totalPages <= 1) return '';

  return `
    <div class="pagination">
      <button onclick="setAcademicOrderPage(${currentPage - 1})" ${currentPage <= 1 ? 'disabled' : ''}>上一页</button>
      <span>第 ${currentPage} / ${totalPages} 页（共 ${total} 条）</span>
      <button onclick="setAcademicOrderPage(${currentPage + 1})" ${currentPage >= totalPages ? 'disabled' : ''}>下一页</button>
    </div>
  `;
}

function setAcademicOrderStatusFilter(status) {
  state.academicOrderStatusFilter = status;
  state.academicOrderOffset = 0;
  loadAcademicOrders();
}

function setAcademicOrderScope(scope) {
  state.academicOrderScope = scope;
  state.academicOrderOffset = 0;
  loadAcademicOrders();
}

function setAcademicOrderPage(page) {
  const limit = state.academicOrderLimit || 20;
  state.academicOrderOffset = (page - 1) * limit;
  loadAcademicOrders();
}

function refreshAcademicOrders() {
  loadAcademicOrders();
}

async function receiveOrder(orderId) {
  if (!confirm('确认接收此订单？')) return;
  try {
    await api(`/api/orders/${orderId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        academic_user_id: state.user.id,
        order_status: 'in_progress'
      })
    });
    setFlash('success', '接单成功', '订单已分配给您');
    loadAcademicOrders();
  } catch (err) {
    setFlash('error', '接单失败', err.message);
  }
}

// ===========================================================================
// 教务端订单详情视图
// ===========================================================================
async function loadAcademicOrderDetail(id) {
  if (!id) return;
  state.academicOrderDetailLoading = true;
  try {
    const order = await api(`/api/orders/${id}`);
    state.academicOrderDetail = order;
    const lead = await api(`/api/leads/${order.leadId}`).catch(() => null);
    state.academicOrderDetailLead = lead;
  } catch (err) {
    console.error('[academic] load order detail failed', err);
    setFlash('error', '加载失败', err.message);
  } finally {
    state.academicOrderDetailLoading = false;
    renderApp();
  }
}

function openAcademicOrderDetail(id) {
  state.academicOrderDetailId = id;
  state.academicOrderDetail = null;
  state.academicOrderDetailLead = null;
  state.academicOrderDetailTab = 'info';
  state.currentView = 'academic-order-detail';
  loadAcademicOrderDetail(id);
  renderApp();
}

function renderAcademicOrderDetail() {
  const order = state.academicOrderDetail;
  const lead = state.academicOrderDetailLead;
  const loading = state.academicOrderDetailLoading;
  const tab = state.academicOrderDetailTab || 'info';

  if (loading) {
    return '<div class="loading-spinner">加载中...</div>';
  }

  if (!order) {
    return '<div class="empty-state">订单不存在</div>';
  }

  return `
    <div class="academic-order-detail">
      <div class="page-header">
        <h2>订单详情</h2>
        <div class="header-actions">
          <button onclick="backToAcademicOrderPool()" class="btn-secondary">返回</button>
        </div>
      </div>

      <div class="detail-tabs">
        <button class="tab-btn ${tab === 'info' ? 'active' : ''}" onclick="setAcademicOrderDetailTab('info')">基本信息</button>
        <button class="tab-btn ${tab === 'timeline' ? 'active' : ''}" onclick="setAcademicOrderDetailTab('timeline')">进度跟进</button>
        <button class="tab-btn ${tab === 'abnormal' ? 'active' : ''}" onclick="setAcademicOrderDetailTab('abnormal')">异常反馈</button>
      </div>

      <div class="detail-content">
        ${tab === 'info' ? renderAcademicOrderInfo(order, lead) : ''}
        ${tab === 'timeline' ? renderAcademicOrderTimeline(order) : ''}
        ${tab === 'abnormal' ? renderAcademicOrderAbnormal(order) : ''}
      </div>
    </div>
  `;
}

function renderAcademicOrderInfo(order, lead) {
  return `
    <div class="order-info-section">
      <h3>订单信息</h3>
      <div class="info-grid">
        <div class="info-item">
          <label>订单ID：</label>
          <span>${order.id}</span>
        </div>
        <div class="info-item">
          <label>订单状态：</label>
          <span class="status-badge status-${order.orderStatus}">${getOrderStatusLabel(order.orderStatus)}</span>
        </div>
        <div class="info-item">
          <label>付款状态：</label>
          <span class="status-badge status-${order.paidStatus}">${getPaidStatusLabel(order.paidStatus)}</span>
        </div>
        <div class="info-item">
          <label>服务类型：</label>
          <span>${order.serviceType || '-'}</span>
        </div>
        <div class="info-item">
          <label>成交金额：</label>
          <span>${formatOrderAmount(order.amount)}</span>
        </div>
        <div class="info-item">
          <label>销售：</label>
          <span>${findOrderUserLabel(order.salesUserId)}</span>
        </div>
        <div class="info-item">
          <label>教务：</label>
          <span>${findOrderUserLabel(order.academicUserId) || '未分配'}</span>
        </div>
        <div class="info-item">
          <label>创建时间：</label>
          <span>${formatDateTime(order.createdAt)}</span>
        </div>
        <div class="info-item full-width">
          <label>备注：</label>
          <span>${order.remark || '-'}</span>
        </div>
      </div>

      ${lead ? `
        <h3>客户信息</h3>
        <div class="info-grid">
          <div class="info-item">
            <label>联系方式：</label>
            <span>${lead.contactInfo || '-'}</span>
          </div>
          <div class="info-item">
            <label>昵称：</label>
            <span>${lead.nickname || '-'}</span>
          </div>
          <div class="info-item">
            <label>预算：</label>
            <span>${lead.budget || '-'}</span>
          </div>
          <div class="info-item">
            <label>需求：</label>
            <span>${lead.majorContent || '-'}</span>
          </div>
          <div class="info-item full-width">
            <label>销售反馈：</label>
            <span>${lead.salesFeedback || '-'}</span>
          </div>
        </div>
      ` : ''}

      <div class="action-buttons">
        <button onclick="openUpdateOrderStatusModal('${order.id}')" class="btn-primary">更新状态</button>
        <button onclick="openAddFollowRecordModal('${order.id}')" class="btn-primary">添加跟进</button>
      </div>
    </div>
  `;
}

function renderAcademicOrderTimeline(order) {
  const records = order.followRecords || [];

  return `
    <div class="order-timeline-section">
      <div class="timeline-header">
        <h3>进度跟进记录</h3>
        <button onclick="openAddFollowRecordModal('${order.id}')" class="btn-primary">添加跟进</button>
      </div>

      ${records.length === 0 ? '<div class="empty-state">暂无跟进记录</div>' : `
        <div class="timeline-list">
          ${records.map(record => `
            <div class="timeline-item">
              <div class="timeline-marker"></div>
              <div class="timeline-content">
                <div class="timeline-header">
                  <span class="timeline-node">${record.nodeType}</span>
                  <span class="timeline-time">${formatDateTime(record.createdAt)}</span>
                </div>
                <div class="timeline-body">${record.content || '-'}</div>
                ${record.nextRemindAt ? `<div class="timeline-remind">下次提醒：${formatDateTime(record.nextRemindAt)}</div>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      `}
    </div>
  `;
}

function renderAcademicOrderAbnormal(order) {
  const abnormalRecords = (order.followRecords || []).filter(r => r.nodeType && r.nodeType.includes('异常'));

  return `
    <div class="order-abnormal-section">
      <div class="abnormal-header">
        <h3>异常反馈记录</h3>
        <button onclick="openAddAbnormalFeedbackModal('${order.id}')" class="btn-danger">提交异常</button>
      </div>

      ${abnormalRecords.length === 0 ? '<div class="empty-state">暂无异常记录</div>' : `
        <div class="abnormal-list">
          ${abnormalRecords.map(record => `
            <div class="abnormal-item">
              <div class="abnormal-type">${record.nodeType}</div>
              <div class="abnormal-content">${record.content || '-'}</div>
              <div class="abnormal-time">${formatDateTime(record.createdAt)}</div>
            </div>
          `).join('')}
        </div>
      `}
    </div>
  `;
}

function setAcademicOrderDetailTab(tab) {
  state.academicOrderDetailTab = tab;
  renderApp();
}

function backToAcademicOrderPool() {
  state.currentView = 'academic-order-pool';
  renderApp();
}

// ===========================================================================
// 模态框：更新订单状态
// ===========================================================================
function openUpdateOrderStatusModal(orderId) {
  const order = state.academicOrderDetail;
  if (!order) return;

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h3>更新订单状态</h3>
        <button onclick="this.closest('.modal-overlay').remove()" class="modal-close">×</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label>订单状态：</label>
          <select id="updateOrderStatus">
            ${ORDER_STATUS_OPTIONS.map(status => `
              <option value="${status}" ${order.orderStatus === status ? 'selected' : ''}>
                ${getOrderStatusLabel(status)}
              </option>
            `).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>付款状态：</label>
          <select id="updatePaidStatus">
            ${PAID_STATUS_OPTIONS.map(status => `
              <option value="${status}" ${order.paidStatus === status ? 'selected' : ''}>
                ${getPaidStatusLabel(status)}
              </option>
            `).join('')}
          </select>
        </div>
      </div>
      <div class="modal-footer">
        <button onclick="this.closest('.modal-overlay').remove()" class="btn-secondary">取消</button>
        <button onclick="submitUpdateOrderStatus('${orderId}')" class="btn-primary">确定</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

async function submitUpdateOrderStatus(orderId) {
  const orderStatus = document.getElementById('updateOrderStatus')?.value;
  const paidStatus = document.getElementById('updatePaidStatus')?.value;

  try {
    await api(`/api/orders/${orderId}`, {
      method: 'PATCH',
      body: JSON.stringify({ order_status: orderStatus, paid_status: paidStatus })
    });
    setFlash('success', '更新成功', '订单状态已更新');
    document.querySelector('.modal-overlay')?.remove();
    loadAcademicOrderDetail(orderId);
  } catch (err) {
    setFlash('error', '更新失败', err.message);
  }
}

// ===========================================================================
// 模态框：添加跟进记录
// ===========================================================================
function openAddFollowRecordModal(orderId) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h3>添加跟进记录</h3>
        <button onclick="this.closest('.modal-overlay').remove()" class="modal-close">×</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label>节点类型：</label>
          <select id="followNodeType">
            <option value="沟通">沟通</option>
            <option value="资料收集">资料收集</option>
            <option value="老师安排">老师安排</option>
            <option value="节点完成">节点完成</option>
            <option value="交付">交付</option>
          </select>
        </div>
        <div class="form-group">
          <label>跟进内容：</label>
          <textarea id="followContent" rows="4" placeholder="请输入跟进内容"></textarea>
        </div>
        <div class="form-group">
          <label>下次提醒时间：</label>
          <input type="datetime-local" id="followNextRemind" />
        </div>
      </div>
      <div class="modal-footer">
        <button onclick="this.closest('.modal-overlay').remove()" class="btn-secondary">取消</button>
        <button onclick="submitAddFollowRecord('${orderId}')" class="btn-primary">提交</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

async function submitAddFollowRecord(orderId) {
  const nodeType = document.getElementById('followNodeType')?.value;
  const content = document.getElementById('followContent')?.value;
  const nextRemind = document.getElementById('followNextRemind')?.value;

  if (!nodeType) {
    setFlash('warn', '请选择节点类型', '');
    return;
  }

  try {
    await api(`/api/orders/${orderId}/follow-records`, {
      method: 'POST',
      body: JSON.stringify({
        nodeType,
        content: content || null,
        nextRemindAt: nextRemind || null
      })
    });
    setFlash('success', '添加成功', '跟进记录已添加');
    document.querySelector('.modal-overlay')?.remove();
    loadAcademicOrderDetail(orderId);
  } catch (err) {
    setFlash('error', '添加失败', err.message);
  }
}

// ===========================================================================
// 模态框：提交异常反馈
// ===========================================================================
function openAddAbnormalFeedbackModal(orderId) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h3>提交异常反馈</h3>
        <button onclick="this.closest('.modal-overlay').remove()" class="modal-close">×</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label>异常类型：</label>
          <select id="abnormalType">
            <option value="客户不配合-异常">客户不配合</option>
            <option value="资料缺失-异常">资料缺失</option>
            <option value="老师未响应-异常">老师未响应</option>
            <option value="周期风险-异常">周期风险</option>
            <option value="付款异常-异常">付款异常</option>
            <option value="其他-异常">其他</option>
          </select>
        </div>
        <div class="form-group">
          <label>异常说明：</label>
          <textarea id="abnormalContent" rows="4" placeholder="请详细描述异常情况" required></textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button onclick="this.closest('.modal-overlay').remove()" class="btn-secondary">取消</button>
        <button onclick="submitAbnormalFeedback('${orderId}')" class="btn-danger">提交</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

async function submitAbnormalFeedback(orderId) {
  const nodeType = document.getElementById('abnormalType')?.value;
  const content = document.getElementById('abnormalContent')?.value;

  if (!content || !content.trim()) {
    setFlash('warn', '请填写异常说明', '');
    return;
  }

  try {
    await api(`/api/orders/${orderId}/follow-records`, {
      method: 'POST',
      body: JSON.stringify({
        nodeType,
        content: content.trim()
      })
    });

    // 同时更新订单状态为异常
    await api(`/api/orders/${orderId}`, {
      method: 'PATCH',
      body: JSON.stringify({ order_status: 'abnormal' })
    });

    setFlash('success', '提交成功', '异常反馈已提交，销售将收到通知');
    document.querySelector('.modal-overlay')?.remove();
    loadAcademicOrderDetail(orderId);
  } catch (err) {
    setFlash('error', '提交失败', err.message);
  }
}

// ===========================================================================
// 主渲染函数：供 app.js 调用
// ===========================================================================
function renderAcademicOrders() {
  if (!state.academicOrders && !state.academicOrdersLoading) {
    loadAcademicOrders();
  }
  return renderAcademicOrderPool();
}

function renderAcademicOrderDetail() {
  const order = state.academicOrderDetail;
  const lead = state.academicOrderDetailLead;
  const loading = state.academicOrderDetailLoading;
  const tab = state.academicOrderDetailTab || 'info';

  if (loading) {
    return '<div class="loading-spinner">加载中...</div>';
  }

  if (!order) {
    return '<div class="empty-state">订单不存在</div>';
  }

  return `
    <div class="academic-order-detail">
      <div class="page-header">
        <h2>订单详情</h2>
        <div class="header-actions">
          <button onclick="backToAcademicOrderPool()" class="btn-secondary">返回</button>
        </div>
      </div>

      <div class="detail-tabs">
        <button class="tab-btn ${tab === 'info' ? 'active' : ''}" onclick="setAcademicOrderDetailTab('info')">基本信息</button>
        <button class="tab-btn ${tab === 'timeline' ? 'active' : ''}" onclick="setAcademicOrderDetailTab('timeline')">进度跟进</button>
        <button class="tab-btn ${tab === 'abnormal' ? 'active' : ''}" onclick="setAcademicOrderDetailTab('abnormal')">异常反馈</button>
      </div>

      <div class="detail-content">
        ${tab === 'info' ? renderAcademicOrderInfo(order, lead) : ''}
        ${tab === 'timeline' ? renderAcademicOrderTimeline(order) : ''}
        ${tab === 'abnormal' ? renderAcademicOrderAbnormal(order) : ''}
      </div>
    </div>
  `;
}

function renderAcademicAbnormal() {
  if (!state.academicAbnormalOrders && !state.academicAbnormalLoading) {
    loadAcademicAbnormalOrders();
  }
  return renderAcademicAbnormalOrders();
}

// ===========================================================================
// 异常订单视图
// ===========================================================================
async function loadAcademicAbnormalOrders() {
  if (!state.user || state.user.role !== 'academic') return;
  state.academicAbnormalLoading = true;
  try {
    const params = new URLSearchParams({
      role: 'academic',
      status: 'abnormal',
      scope: 'all'
    });
    const result = await api(`/api/orders?${params}`);
    state.academicAbnormalOrders = Array.isArray(result) ? result : (result?.items || []);
  } catch (err) {
    console.error('[academic] load abnormal orders failed', err);
    state.academicAbnormalOrders = [];
  } finally {
    state.academicAbnormalLoading = false;
    renderApp();
  }
}

function renderAcademicAbnormalOrders() {
  const orders = state.academicAbnormalOrders || [];
  const loading = state.academicAbnormalLoading;

  return `
    <div class="academic-abnormal-orders">
      <div class="page-header">
        <h2>异常订单</h2>
        <div class="header-actions">
          <button onclick="loadAcademicAbnormalOrders()" class="btn-secondary">刷新</button>
        </div>
      </div>

      ${loading ? '<div class="loading-spinner">加载中...</div>' : ''}
      ${!loading && orders.length === 0 ? '<div class="empty-state">暂无异常订单</div>' : ''}
      ${!loading && orders.length > 0 ? `
        <div class="orders-table-wrapper">
          <table class="data-table">
            <thead>
              <tr>
                <th>订单ID</th>
                <th>客资</th>
                <th>服务类型</th>
                <th>金额</th>
                <th>销售</th>
                <th>教务</th>
                <th>创建时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              ${orders.map(order => {
                const lead = findLeadByIdLite(order.leadId);
                return `
                  <tr>
                    <td>${shortOrderId(order.id)}</td>
                    <td>${lead?.contactInfo || lead?.nickname || '-'}</td>
                    <td>${order.serviceType || '-'}</td>
                    <td>${formatOrderAmount(order.amount)}</td>
                    <td>${findOrderUserLabel(order.salesUserId)}</td>
                    <td>${findOrderUserLabel(order.academicUserId) || '未分配'}</td>
                    <td>${formatDateTime(order.createdAt)}</td>
                    <td>
                      <button onclick="openAcademicOrderDetail('${order.id}')" class="btn-link">详情</button>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      ` : ''}
    </div>
  `;
}

// ===========================================================================
// §5.1 P0-D 教务端首页 6 指标 dashboard
// ===========================================================================
async function loadAcademicStats() {
  if (!state.user || state.user.role !== 'academic') return;
  state.academicStatsLoading = true;
  try {
    const result = await api('/api/orders/stats?role=academic');
    state.academicStats = result || null;
  } catch (err) {
    console.error('[academic] load stats failed', err);
    state.academicStats = null;
  } finally {
    state.academicStatsLoading = false;
    renderApp();
  }
}

function renderAcademicDashboard() {
  if (!state.academicStats && !state.academicStatsLoading) {
    loadAcademicStats();
  }
  const stats = state.academicStats || { byStatus: {}, expiringSoon: 0, total: 0 };
  const by = stats.byStatus || {};
  const loading = state.academicStatsLoading;
  const userName = state.user?.employeeName || state.user?.username || '';

  // 6 卡片：to_receive / in_progress / awaiting_client_info /
  //        awaiting_teacher / expiringSoon / abnormal
  // 后端 byStatus 用的是 DB enum（pending_accept / waiting_material / ...）；
  // 前端 tabs 用旧词（to_receive / awaiting_client_info / to_deliver）。
  // 两边都列出来求和，保持口径可追溯。
  const cardPending = Number(
    by.pending_accept != null ? by.pending_accept : (by.to_receive || 0)
  );
  const cardInProgress = Number(by.in_progress || 0);
  const cardWaitingMaterial = Number(
    by.waiting_material != null ? by.waiting_material : (by.awaiting_client_info || 0)
  );
  const cardWaitingTeacher = Number(
    by.waiting_teacher != null ? by.waiting_teacher : (by.awaiting_teacher || 0)
  );
  const cardExpiring = Number(stats.expiringSoon || 0);
  const cardAbnormal = Number(by.abnormal || 0);

  const cards = [
    { key: 'to_receive', label: '待接收', value: cardPending, hint: '销售已成交，等待教务接单', tone: 'warn' },
    { key: 'in_progress', label: '进行中', value: cardInProgress, hint: '正在推进的订单', tone: 'info' },
    { key: 'awaiting_client_info', label: '待客户资料', value: cardWaitingMaterial, hint: '等客户提供资料', tone: 'muted' },
    { key: 'awaiting_teacher', label: '待老师安排', value: cardWaitingTeacher, hint: '待分配老师', tone: 'muted' },
    { key: 'expiring', label: '即将到期', value: cardExpiring, hint: '节点下次提醒 24h 内', tone: 'warn' },
    { key: 'abnormal', label: '异常订单', value: cardAbnormal, hint: '需要教务介入处理', tone: 'danger' }
  ];

  const renderCard = (c) => `
    <button
      class="stat js-academic-stat-card"
      data-status="${c.key}"
      style="text-align:left; cursor:pointer; border:0; font:inherit; color:inherit; width:100%;"
    >
      <div class="stat-top">
        <span class="mini-tag">${c.label}</span>
        <span class="tag tag-soft">${c.value >= 0 ? c.value : '—'}</span>
      </div>
      <strong>${loading ? '—' : c.value}</strong>
      <div class="muted" style="font-size:12px; margin-top:6px;">${c.hint}</div>
    </button>
  `;

  return `
    <div class="academic-dashboard-page">
      <div class="page-header page-header-rich">
        <div>
          <h2>教务首页${userName ? ` · ${escapeHtml(userName)}` : ''}</h2>
          <p class="page-desc">六张指标卡显示您当前负责订单的整体情况，点击任一卡片直接进入订单池对应状态。</p>
        </div>
        <div class="toolbar toolbar-end">
          <button class="ghost js-refresh-academic-stats" type="button">${loading ? '刷新中…' : '刷新'}</button>
        </div>
      </div>
      <div class="stat-grid grid-3">
        ${cards.map(renderCard).join('')}
      </div>
      <div class="panel" style="margin-top:18px;">
        <div class="section-head" style="grid-template-columns: 1fr; padding-bottom:8px;">
          <h3>快捷入口</h3>
        </div>
        <div class="toolbar">
          <button class="ghost" onclick="setAcademicCurrentView('academic-orders')" type="button">进入订单池</button>
          <button class="ghost" onclick="setAcademicCurrentView('academic-reminders')" type="button">查看节点提醒（${cardExpiring}）</button>
          <button class="ghost" onclick="setAcademicCurrentView('academic-abnormal')" type="button">处理异常（${cardAbnormal}）</button>
          <button class="ghost" onclick="setAcademicCurrentView('academic-messages')" type="button">消息中心</button>
        </div>
      </div>
    </div>
  `;
}

function setAcademicCurrentView(view) {
  if (!view) return;
  state.currentView = view;
  renderApp();
}

// 卡片点击：跳到订单池并预填状态过滤
function openAcademicPoolWithStatus(statusKey) {
  if (statusKey === 'expiring') {
    state.currentView = 'academic-reminders';
    state.academicOrders = null;
    state.academicOrderStatusFilter = '';
    state.academicOrdersFilter = '';
    renderApp();
    return;
  }
  state.academicOrderStatusFilter = statusKey || '';
  state.academicOrdersFilter = statusKey || '';
  state.academicOrderScope = 'mine';
  state.academicOrdersScope = 'mine';
  state.academicOrders = null;
  state.currentView = 'academic-orders';
  renderApp();
}

// ===========================================================================
// 节点提醒：nextRemindAt < now+24h 的订单
// ===========================================================================
async function loadAcademicReminders() {
  if (!state.user || state.user.role !== 'academic') return;
  state.academicRemindersLoading = true;
  try {
    // 后端 /api/orders 暂未提供 reminderWindow 过滤，
    // 这里用 stats.expiringSoon 显示计数，再用「我领取的 + 进行中」订单池
    // 给出可见列表（管理员可手动筛 follow_records.next_remind_at）。
    const params = new URLSearchParams({
      role: 'academic',
      scope: 'mine',
      limit: '50',
      offset: '0'
    });
    const rows = await api(`/api/orders?${params.toString()}`);
    const list = Array.isArray(rows) ? rows : (rows?.items || []);
    state.academicReminders = list;
  } catch (err) {
    console.error('[academic] load reminders failed', err);
    state.academicReminders = [];
  } finally {
    state.academicRemindersLoading = false;
    renderApp();
  }
}

function renderAcademicReminders() {
  if (state.academicReminders === null && !state.academicRemindersLoading) {
    loadAcademicReminders();
  }
  const list = Array.isArray(state.academicReminders) ? state.academicReminders : null;
  const loading = state.academicRemindersLoading;
  const expiringCount = state.academicStats?.expiringSoon ?? null;

  return `
    <div class="academic-reminders-page">
      <div class="page-header page-header-rich">
        <div>
          <h2>节点提醒</h2>
          <p class="page-desc">展示您当前负责的订单，顶部计数显示节点下次提醒时间在 24 小时内的订单数。请尽快跟进或更新下次提醒时间。</p>
        </div>
        <div class="toolbar toolbar-end">
          ${expiringCount !== null ? `<span class="mini-tag">即将到期 ${expiringCount}</span>` : ''}
          <button class="ghost" onclick="loadAcademicReminders()" type="button">${loading ? '加载中…' : '刷新'}</button>
        </div>
      </div>
      <div class="panel">
        ${list === null
          ? '<div class="loading-spinner">加载中…</div>'
          : list.length === 0
            ? '<div class="empty-state">暂无需要跟进的订单。</div>'
            : `<div class="orders-table-wrapper">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>订单ID</th>
                      <th>客资</th>
                      <th>服务类型</th>
                      <th>状态</th>
                      <th>金额</th>
                      <th>销售</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${list.map((o) => `
                      <tr>
                        <td>${shortOrderId(o.id)}</td>
                        <td>${escapeHtml(o.leadId || '-')}</td>
                        <td>${escapeHtml(o.serviceType || '-')}</td>
                        <td><span class="status-badge status-${escapeHtmlAttribute(o.orderStatus || '')}">${getOrderStatusLabel(o.orderStatus)}</span></td>
                        <td>${formatOrderAmount(o.amount)}</td>
                        <td>${escapeHtml(findOrderUserLabel(o.salesUserId))}</td>
                        <td>
                          <button class="btn-link" onclick="openAcademicOrderDetail('${escapeHtmlAttribute(o.id)}')" type="button">查看详情</button>
                        </td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>`}
      </div>
    </div>
  `;
}

// ===========================================================================
// 导出页：当前用户导出历史
// ===========================================================================
async function loadAcademicExports() {
  if (!state.user) return;
  state.academicExportsLoading = true;
  try {
    const params = new URLSearchParams({ limit: '50', offset: '0' });
    if (state.user.id) params.append('actorUserId', state.user.id);
    const rows = await api(`/api/exports?${params.toString()}`);
    const list = Array.isArray(rows) ? rows : (rows?.items || []);
    state.academicExports = list;
  } catch (err) {
    console.error('[academic] load exports failed', err);
    state.academicExports = [];
  } finally {
    state.academicExportsLoading = false;
    renderApp();
  }
}

function renderAcademicExports() {
  if (state.academicExports === null && !state.academicExportsLoading) {
    loadAcademicExports();
  }
  const list = Array.isArray(state.academicExports) ? state.academicExports : null;
  const loading = state.academicExportsLoading;

  return `
    <div class="academic-exports-page">
      <div class="page-header page-header-rich">
        <div>
          <h2>导出历史</h2>
          <p class="page-desc">展示您提交的导出任务，文件就绪后可点击下载链接。</p>
        </div>
        <div class="toolbar toolbar-end">
          <button class="ghost" onclick="loadAcademicExports()" type="button">${loading ? '加载中…' : '刷新'}</button>
        </div>
      </div>
      <div class="panel">
        ${list === null
          ? '<div class="loading-spinner">加载中…</div>'
          : list.length === 0
            ? '<div class="empty-state">暂无导出记录。在订单池页面点「导出 Excel」会创建一条记录。</div>'
            : `<div class="orders-table-wrapper">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>任务 ID</th>
                      <th>类型</th>
                      <th>状态</th>
                      <th>创建时间</th>
                      <th>下载</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${list.map((row) => `
                      <tr>
                        <td>${shortOrderId(row.id)}</td>
                        <td>${escapeHtml(row.exportType || '-')}</td>
                        <td><span class="status-badge status-${escapeHtmlAttribute(row.status || 'pending')}">${escapeHtml(row.status || '处理中')}</span></td>
                        <td>${row.createdAt ? formatDate(row.createdAt) : '-'}</td>
                        <td>
                          ${row.fileUrl
                            ? `<a class="btn-link" href="${escapeHtmlAttribute(row.fileUrl)}" target="_blank" rel="noopener noreferrer">下载</a>`
                            : '<span class="muted">未就绪</span>'}
                        </td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>`}
      </div>
    </div>
  `;
}

// ===========================================================================
// 消息中心：复用现有通知列表（按当前教务用户过滤）
// ===========================================================================
function renderAcademicMessages() {
  // state.notifications 已由 notifications.js 拉取并实时更新，直接渲染即可
  const items = Array.isArray(state.notifications) ? state.notifications : [];
  const unread = items.filter((it) => it && it.unread).length;
  const tab = state.academicMessagesTab || 'all';
  const visible = tab === 'unread' ? items.filter((it) => it && it.unread) : items;

  return `
    <div class="academic-messages-page">
      <div class="page-header page-header-rich">
        <div>
          <h2>消息中心</h2>
          <p class="page-desc">仅展示您作为教务收到的提醒、订单进度更新和异常通知。</p>
        </div>
        <div class="toolbar toolbar-end">
          <span class="mini-tag">未读 ${unread}</span>
          <button class="ghost js-academic-mark-all-read" type="button">全部已读</button>
        </div>
      </div>
      <div class="panel">
        <div class="toolbar" style="padding:8px 0;">
          <button class="js-academic-msg-tab ${tab === 'all' ? 'primary' : 'ghost'}" data-tab="all" type="button">全部（${items.length}）</button>
          <button class="js-academic-msg-tab ${tab === 'unread' ? 'primary' : 'ghost'}" data-tab="unread" type="button">未读（${unread}）</button>
        </div>
        <div class="notification-list" id="academicMessagesList">
          ${visible.length === 0
            ? '<div class="empty-state">暂无消息</div>'
            : visible.map((item) => `
                <button class="notification-item ${item.unread ? 'unread' : ''} js-academic-msg-item" data-id="${escapeHtmlAttribute(item.id || '')}" type="button">
                  <strong>${escapeHtml(item.title || '系统消息')}</strong>
                  <p>${escapeHtml(item.message || '')}</p>
                  <span class="muted">${item.createdAt ? formatDate(item.createdAt) : ''}</span>
                </button>
              `).join('')}
        </div>
      </div>
    </div>
  `;
}

async function academicMarkAllRead() {
  try {
    if (typeof api === 'function') {
      await api('/api/notifications/read-all', { method: 'POST' });
    }
  } catch (e) {
    // 静默失败，前端也会按本地点亮处理
  }
  if (Array.isArray(state.notifications)) {
    state.notifications.forEach((n) => { n.unread = false; n.readStatus = 1; });
  }
  state.unreadNotificationCount = 0;
  setFlash('success', '全部已标记为已读', '');
  renderApp();
}
