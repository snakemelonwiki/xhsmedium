/**
 * 角色权限过滤中间件
 * 实现四端口数据隔离
 */

const { UserRole } = require('../constants/enums');

/**
 * 根据角色过滤查询条件
 * @param {string} role - 用户角色
 * @param {string} userId - 用户ID
 * @param {string} employeeId - 员工ID
 * @param {object} query - 原始查询条件
 * @returns {object} 过滤后的查询条件
 */
function filterByRole(role, userId, employeeId, query = {}) {
  const filtered = { ...query };

  switch (role) {
    case UserRole.STAFF.code:
    case UserRole.OPERATION.code:
      // 运营：只能看自己的作品、客资、账号
      filtered.employee_id = employeeId;
      break;

    case UserRole.SALES.code:
      // 销售：只能看分配给自己的客资和订单
      filtered.assigned_sales_user_id = userId;
      break;

    case UserRole.ACADEMIC.code:
      // 教务：只能看已成交且分配给自己的订单
      filtered.assigned_academic_user_id = userId;
      filtered.process_status = 'deal_done';
      break;

    case UserRole.OWNER.code:
    case UserRole.SUPERVISOR.code:
    case UserRole.ADMIN.code:
      // 主管和管理员：可看全局，不添加过滤条件
      break;

    default:
      // 未知角色：拒绝访问
      throw new Error('Invalid role');
  }

  return filtered;
}

/**
 * Express 中间件：注入权限过滤
 */
function injectPermissionFilter(req, res, next) {
  const user = req.user;
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // 将过滤函数注入到 req 对象
  req.filterByRole = (query = {}) => {
    return filterByRole(user.role, user.id, user.employee_id, query);
  };

  next();
}

/**
 * 检查用户是否有权限访问指定资源
 * @param {string} role - 用户角色
 * @param {string} userId - 用户ID
 * @param {string} employeeId - 员工ID
 * @param {object} resource - 资源对象
 * @returns {boolean} 是否有权限
 */
function canAccessResource(role, userId, employeeId, resource) {
  switch (role) {
    case UserRole.STAFF.code:
    case UserRole.OPERATION.code:
      return resource.employee_id === employeeId;

    case UserRole.SALES.code:
      return resource.assigned_sales_user_id === userId;

    case UserRole.ACADEMIC.code:
      return resource.assigned_academic_user_id === userId &&
             resource.process_status === 'deal_done';

    case UserRole.OWNER.code:
    case UserRole.SUPERVISOR.code:
    case UserRole.ADMIN.code:
      return true;

    default:
      return false;
  }
}

module.exports = {
  filterByRole,
  injectPermissionFilter,
  canAccessResource
};
