/**
 * 状态枚举定义
 * 所有状态使用 VARCHAR 存储，code 使用英文小写+下划线
 */

// 客资状态
const LeadStatus = {
  NEW: { code: 'new', label: '新客资', description: '新录入的客资' },
  ASSIGNED: { code: 'assigned', label: '已分配', description: '已分配给销售' },
  IN_FOLLOWUP: { code: 'in_followup', label: '跟进中', description: '销售跟进中' },
  IN_COLLABORATION: { code: 'in_collaboration', label: '协同中', description: '销售请求运营协同' },
  OPERATION_HANDLED: { code: 'operation_handled', label: '运营已处理', description: '运营处理协同中' },
  ADDED_SUCCESS: { code: 'added_success', label: '已添加通过', description: '成功添加客户' },
  INVALID: { code: 'invalid', label: '无效', description: '无效客资' }
};

// 添加状态
const AddStatus = {
  NOT_ADDED: { code: 'not_added', label: '未添加', description: '尚未添加' },
  APPLIED: { code: 'applied', label: '已申请', description: '已申请添加' },
  NOT_PASSED: { code: 'not_passed', label: '未通过', description: '添加未通过' },
  OPERATION_REMINDED: { code: 'operation_reminded', label: '已提醒运营', description: '已提醒运营处理' },
  ADDED: { code: 'added', label: '已添加', description: '已成功添加' }
};

// 销售处理状态
const ProcessStatus = {
  NOT_CONTACTED: { code: 'not_contacted', label: '未联系', description: '尚未联系客户' },
  WAITING_PASS: { code: 'waiting_pass', label: '待通过', description: '等待客户通过' },
  COMMUNICATING: { code: 'communicating', label: '沟通中', description: '正在沟通' },
  QUOTED: { code: 'quoted', label: '已报价', description: '已提供报价' },
  DEAL_PENDING: { code: 'deal_pending', label: '待成交', description: '等待成交' },
  DEAL_DONE: { code: 'deal_done', label: '已成交', description: '已成交' },
  INVALID: { code: 'invalid', label: '无效', description: '无效线索' }
};

// 成交状态
const DealStatus = {
  NOT_DEAL: { code: 'not_deal', label: '未成交', description: '尚未成交' },
  DEAL_PENDING: { code: 'deal_pending', label: '待成交', description: '等待成交' },
  DEAL_DONE: { code: 'deal_done', label: '已成交', description: '已成交' },
  REFUNDED: { code: 'refunded', label: '已退款', description: '已退款' },
  INVALID: { code: 'invalid', label: '无效', description: '无效订单' }
};

// 协同状态
const CollaborationStatus = {
  PENDING: { code: 'pending', label: '待处理', description: '等待运营处理' },
  HANDLING: { code: 'handling', label: '处理中', description: '运营处理中' },
  HANDLED: { code: 'handled', label: '已处理', description: '运营已处理' },
  CLOSED: { code: 'closed', label: '已关闭', description: '协同已关闭' },
  TIMEOUT: { code: 'timeout', label: '已超时', description: '协同超时' }
};

// 订单状态
const OrderStatus = {
  PENDING_ACCEPT: { code: 'pending_accept', label: '待接单', description: '等待教务接单' },
  IN_PROGRESS: { code: 'in_progress', label: '进行中', description: '订单进行中' },
  WAITING_MATERIAL: { code: 'waiting_material', label: '待补充资料', description: '等待客户补充资料' },
  WAITING_TEACHER: { code: 'waiting_teacher', label: '待分配老师', description: '等待分配老师' },
  DELIVERING: { code: 'delivering', label: '交付中', description: '正在交付' },
  COMPLETED: { code: 'completed', label: '已完成', description: '订单已完成' },
  ABNORMAL: { code: 'abnormal', label: '异常', description: '订单异常' },
  CLOSED: { code: 'closed', label: '已关闭', description: '订单已关闭' }
};

// 付款状态
const PaymentStatus = {
  UNPAID: { code: 'unpaid', label: '未付款', description: '尚未付款' },
  PARTIAL_PAID: { code: 'partial_paid', label: '部分付款', description: '已部分付款' },
  PAID: { code: 'paid', label: '已付款', description: '已全额付款' },
  REFUNDED: { code: 'refunded', label: '已退款', description: '已退款' }
};

// 交接状态
const HandoverStatus = {
  PENDING: { code: 'pending', label: '待交接', description: '等待交接' },
  HANDED_OVER: { code: 'handed_over', label: '已交接', description: '已交接给教务' },
  ACCEPTED: { code: 'accepted', label: '已接受', description: '教务已接受' },
  REJECTED: { code: 'rejected', label: '已拒绝', description: '教务已拒绝' }
};

// 角色定义
const UserRole = {
  STAFF: { code: 'staff', label: '员工', description: '历史运营员工角色' },
  OWNER: { code: 'owner', label: '总后台', description: '历史总后台管理角色' },
  OPERATION: { code: 'operation', label: '运营', description: '运营端用户' },
  SALES: { code: 'sales', label: '销售', description: '销售端用户' },
  ACADEMIC: { code: 'academic', label: '教务', description: '教务端用户' },
  SUPERVISOR: { code: 'supervisor', label: '主管', description: '主管端用户' },
  ADMIN: { code: 'admin', label: '管理员', description: '系统管理员' }
};

// 通知类型（N-P1-01 修复）
// 与 backend/src/shared/notifications.ts 的 NOTIFICATION_TYPES 严格对齐；
// 1.2 拆分了 deal_closed，新增 order_created / order_handed_over / order_accepted
// 与 order_updated。下线的 supervisor_suggestion / lead_deal_done 不再写入，
// 但保留 label 占位以兼容历史数据展示。
const NotificationType = {
  LEAD_ASSIGNED: { code: 'lead_assigned', label: '新客资分配', description: '销售收到新分配客资' },
  COLLABORATION_REQUESTED: { code: 'collaboration_requested', label: '协同申请', description: '运营收到协同申请' },
  COLLABORATION_HANDLED: { code: 'collaboration_handled', label: '协同已处理', description: '销售收到运营已处理通知' },
  COLLABORATION_TIMEOUT: { code: 'collaboration_timeout', label: '协同超时', description: '协同超时未处理' },
  CUSTOMER_NOT_PASSED: { code: 'customer_not_passed', label: '客户未通过', description: '运营收到客户未通过通知' },
  CUSTOMER_ADDED: { code: 'customer_added', label: '客户已添加', description: '运营收到销售已添加通知' },
  LEAD_SOURCE_CONFIRMED: { code: 'lead_source_confirmed', label: '客资来源已确认', description: '客资来源已确认' },
  DEAL_CLOSED: { code: 'deal_closed', label: '订单已成交（历史）', description: '1.2 之前共用 code，已拆分' },
  ORDER_CREATED: { code: 'order_created', label: '新订单已成交', description: 'closeDeal 触发：销售成单通知教务/主管' },
  ORDER_HANDED_OVER: { code: 'order_handed_over', label: '订单已交接', description: 'handOver 触发：销售主动交接通知教务/主管' },
  ORDER_ACCEPTED: { code: 'order_accepted', label: '订单已被接收', description: 'acceptHandover 触发：教务接单通知销售' },
  ORDER_UPDATED: { code: 'order_updated', label: '订单更新', description: '订单进度更新通知销售/主管' },
  ORDER_NODE_DUE: { code: 'order_node_due', label: '订单节点到期', description: '订单节点即将到期' },
  ORDER_ABNORMAL: { code: 'order_abnormal', label: '订单异常', description: '订单异常通知' },
  IMPORT_DONE: { code: 'import_done', label: '导入完成', description: '导入任务完成' },
  EXPORT_DONE: { code: 'export_done', label: '导出完成', description: '导出任务完成' },
  SUPERVISOR_SUGGESTION: { code: 'supervisor_suggestion', label: '主管建议（已下线）', description: '1.2 已下线，保留仅供历史展示' },
  LEAD_DEAL_DONE: { code: 'lead_deal_done', label: '成交提醒（已下线）', description: '1.2 已下线，保留仅供历史展示' }
};

// 辅助函数：根据 code 获取状态对象
function getStatusByCode(enumObj, code) {
  return Object.values(enumObj).find(item => item.code === code);
}

// 辅助函数：获取所有状态 code 列表
function getAllCodes(enumObj) {
  return Object.values(enumObj).map(item => item.code);
}

module.exports = {
  LeadStatus,
  AddStatus,
  ProcessStatus,
  DealStatus,
  CollaborationStatus,
  OrderStatus,
  PaymentStatus,
  UserRole,
  NotificationType,
  getStatusByCode,
  getAllCodes
};
