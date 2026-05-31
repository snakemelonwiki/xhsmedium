// enums.js — 枚举映射（英文 code → 中文标签）
// 与后端 M1 迁移后的 ENUM 字段保持一致

// 处理状态（process_status）
const PROCESS_STATUS_MAP = {
  not_contacted: '未联系',
  applied: '已发送申请',
  pending: '待通过',
  passed: '已通过',
  chatting: '沟通中',
  quoted: '已报价',
  closed: '已成交',
  invalid: '无效',
  // 兼容旧值（迁移期间可能存在）
  '未接': '未联系',
  '已接': '已发送申请',
  '待通过': '待通过',
  '已通过': '已通过',
  '沟通中': '沟通中',
  '已报价': '已报价',
  '已成交': '已成交',
  '无效': '无效',
};

// 意向度（intention_level）
const INTENTION_LEVEL_MAP = {
  high: '高意向',
  mid: '中意向',
  low: '低意向',
  invalid: '无效',
  pending: '待判断',
  // 兼容旧值
  '强意向': '高意向',
  '了解备用': '中意向',
  '中意向': '中意向',
  '弱': '低意向',
  '低意向': '低意向',
  '无效': '无效',
};

// 添加方式（add_method）
const ADD_METHOD_MAP = {
  active: '主动添加',
  passive: '被动添加',
  customer_init: '客户主动加',
  unknown: '未知',
  // 兼容旧值
  '主动添加': '主动添加',
  '被动添加': '被动添加',
  '客户主动加': '客户主动加',
  '未知': '未知',
};

// 添加状态（add_status，M1 未迁移，保持中文）
const ADD_STATUS_MAP = {
  '未添加': '未添加',
  '已申请添加': '已申请添加',
  '客户未通过': '客户未通过',
  '运营已提醒客户': '运营已提醒',
  '已添加通过': '已添加通过',
};

// 客资主状态（status，M1 未迁移，保持中文）
const LEAD_STATUS_MAP = {
  '新客资': '新客资',
  '已分配': '已分配',
  '销售跟进中': '跟进中',
  '协同中': '协同中',
  '运营处理中': '运营处理中',
  '运营已处理': '运营已处理',
  '已添加通过': '已添加通过',
  '已成交': '已成交',
  '无效': '无效',
};

// 工具函数：获取映射值，未找到时返回原值
function getProcessStatusLabel(code) {
  return PROCESS_STATUS_MAP[code] || code || '未联系';
}

function getIntentionLevelLabel(code) {
  return INTENTION_LEVEL_MAP[code] || code || '待判断';
}

function getAddMethodLabel(code) {
  return ADD_METHOD_MAP[code] || code || '未知';
}

function getAddStatusLabel(code) {
  return ADD_STATUS_MAP[code] || code || '未添加';
}

function getLeadStatusLabel(code) {
  return LEAD_STATUS_MAP[code] || code || '新客资';
}

// 格式化客资编号显示
function formatLeadCode(leadCode) {
  if (!leadCode) return '无编号';
  // L20260429-0016 → L20260429-0016
  return leadCode;
}

// 格式化下次跟进时间
function formatNextFollowTime(nextFollowTime) {
  if (!nextFollowTime) return '未设置';
  const d = new Date(nextFollowTime);
  if (isNaN(d.getTime())) return '未设置';
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd} ${hh}:${min}`;
}

// 处理状态判定：是否表示销售已经联系/推进（用于卡片着色）
function isProcessStatusActive(code) {
  return ['applied', 'pending', 'passed', 'chatting', 'quoted', 'closed', '已接'].includes(code);
}

// 意向度判定：高意向用于强调展示
function isIntentionHigh(code) {
  return code === 'high' || code === '强意向';
}

// 意向度的卡片着色 class
function getIntentionLevelChipClass(code) {
  if (code === 'high' || code === '强意向') return 'is-good';
  if (code === 'mid' || code === '了解备用' || code === '中意向') return 'is-info';
  if (code === 'low' || code === '弱' || code === '低意向') return 'is-warn';
  if (code === 'invalid' || code === '无效') return 'is-danger';
  return '';
}

// ============================================================
// V2 枚举（M6 迁移后）：add_status / status 切英文 code
//   旧 ADD_STATUS_MAP / LEAD_STATUS_MAP（中文 key）保留以兼容旧数据，
//   新页面/卡片走下面的 *_V2 + getAddStatusLabel/isAddStatusAdded/getLeadStatusLabelV2/isStatusNew。
// ============================================================
const ADD_STATUS_MAP_V2 = {
  not_added: '未添加',
  applied: '已申请添加',
  pending: '待通过',
  rejected: '客户未通过',
  op_reminded: '运营已提醒',
  added: '已添加',
};

const LEAD_STATUS_MAP_V2 = {
  new: '新客资',
  assigned: '已分配',
  in_followup: '销售跟进中',
  in_collab: '协同中',
  op_handling: '运营处理中',
  contact_added: '已添加通过',
  deal_closed: '已成交',
  invalid: '无效',
};

function getAddStatusLabel(code) {
  return ADD_STATUS_MAP_V2[code] || ADD_STATUS_MAP[code] || code || '未添加';
}

function isAddStatusAdded(code) {
  return code === 'added' || code === '已添加' || code === '已添加通过';
}

function getLeadStatusLabelV2(code) {
  return LEAD_STATUS_MAP_V2[code] || code || '新客资';
}

function isStatusNew(code) {
  return code === 'new' || code === '新客资';
}
