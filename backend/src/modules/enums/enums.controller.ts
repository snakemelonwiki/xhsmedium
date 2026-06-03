import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../common/auth.guard';

/**
 * 枚举接口 - 提供前端所有状态标签渲染需要的枚举值。
 */
@Controller('enums')
@UseGuards(AuthGuard)
export class EnumsController {
  @Get()
  getAllEnums() {
    return {
      LEAD_STATUS: {
        new: { label: '新分配', color: '#1890ff' },
        contacted: { label: '已联系', color: '#52c41a' },
        interested: { label: '有意向', color: '#faad14' },
        not_interested: { label: '无意向', color: '#8c8c8c' },
        follow_up: { label: '跟进中', color: '#1890ff' },
        deal_closed: { label: '已成交', color: '#52c41a' },
        invalid: { label: '无效', color: '#f5222d' },
      },
      ADD_STATUS: {
        not_added: { label: '未添加', color: '#8c8c8c' },
        adding: { label: '添加中', color: '#1890ff' },
        added: { label: '已添加', color: '#52c41a' },
        refused: { label: '已拒绝', color: '#f5222d' },
      },
      PROCESS_STATUS: {
        not_contacted: { label: '未联系', color: '#8c8c8c' },
        contacted: { label: '已联系', color: '#1890ff' },
        following_up: { label: '跟进中', color: '#faad14' },
        need_more_info: { label: '需补充信息', color: '#722ed1' },
        order_confirmed: { label: '已确认下单', color: '#52c41a' },
      },
      DEAL_STATUS: {
        not_deal: { label: '未成交', color: '#8c8c8c' },
        negotiating: { label: '洽谈中', color: '#1890ff' },
        deal_agreed: { label: '已同意', color: '#52c41a' },
        deal_closed: { label: '已成交', color: '#52c41a' },
      },
      ORDER_STATUS: {
        to_receive: { label: '待接收', color: '#1890ff' },
        in_progress: { label: '进行中', color: '#faad14' },
        completed: { label: '已完成', color: '#52c41a' },
        abnormal: { label: '异常', color: '#f5222d' },
        cancelled: { label: '已取消', color: '#8c8c8c' },
      },
      PAID_STATUS: {
        unpaid: { label: '未支付', color: '#8c8c8c' },
        paying: { label: '支付中', color: '#1890ff' },
        paid: { label: '已支付', color: '#52c41a' },
        refunded: { label: '已退款', color: '#f5222d' },
      },
      HANDOVER_STATUS: {
        pending: { label: '待交接', color: '#1890ff' },
        handed_over: { label: '已交接', color: '#faad14' },
        accepted: { label: '已接收', color: '#52c41a' },
        rejected: { label: '已拒收', color: '#f5222d' },
      },
      COLLAB_STATUS: {
        pending: { label: '待处理', color: '#1890ff' },
        handling: { label: '处理中', color: '#faad14' },
        handled: { label: '已处理', color: '#52c41a' },
        closed: { label: '已关闭', color: '#8c8c8c' },
        timeout: { label: '超时', color: '#f5222d' },
      },
      ACCOUNT_TYPE: {
        小红书: { label: '小红书', color: '#ff4d4f' },
        抖音: { label: '抖音', color: '#00f2ea' },
      },
      NOTIFICATION_TYPE: {
        lead_assigned: { label: '客资分配', color: '#1890ff' },
        order_created: { label: '订单创建', color: '#52c41a' },
        order_abnormal: { label: '订单异常', color: '#f5222d' },
        collab_request: { label: '协作请求', color: '#faad14' },
        collab_handled: { label: '协作处理', color: '#52c41a' },
        system: { label: '系统通知', color: '#8c8c8c' },
      },
      USER_ROLE: {
        admin: { label: '管理员', color: '#722ed1' },
        supervisor: { label: '主管', color: '#722ed1' },
        staff: { label: '运营', color: '#1890ff' },
        operation: { label: '运营', color: '#1890ff' },
        owner: { label: '总后台', color: '#fa541c' },
        sales: { label: '销售', color: '#52c41a' },
        academic: { label: '教务', color: '#13c2c2' },
      },
      USER_STATUS: {
        active: { label: '正常', color: '#52c41a' },
        inactive: { label: '停用', color: '#8c8c8c' },
        locked: { label: '锁定', color: '#f5222d' },
      },
      EMPLOYEE_STATUS: {
        在职: { label: '在职', color: '#52c41a' },
        离职: { label: '离职', color: '#8c8c8c' },
        停用: { label: '停用', color: '#f5222d' },
      },
      ACCOUNT_STATUS: {
        正常: { label: '正常', color: '#52c41a' },
        停用: { label: '停用', color: '#8c8c8c' },
        异常: { label: '异常', color: '#f5222d' },
        注销: { label: '注销', color: '#8c8c8c' },
      },
      POST_TYPE: {
        素人贴: { label: '素人贴', color: '#1890ff' },
        话题贴: { label: '话题贴', color: '#722ed1' },
        获客贴: { label: '获客贴', color: '#52c41a' },
        营销贴: { label: '营销贴', color: '#faad14' },
      },
      INTENTION_LEVEL: {
        pending: { label: '待定', color: '#8c8c8c' },
        low: { label: '低意向', color: '#8c8c8c' },
        medium: { label: '中意向', color: '#faad14' },
        high: { label: '高意向', color: '#52c41a' },
      },
      ADD_METHOD: {
        unknown: { label: '未知', color: '#8c8c8c' },
        qr_code: { label: '扫码', color: '#1890ff' },
        search: { label: '搜索添加', color: '#52c41a' },
        group: { label: '群添加', color: '#faad14' },
      },
    };
  }
}
