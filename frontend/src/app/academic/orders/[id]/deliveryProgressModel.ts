export type DeliveryProgressStage = {
  key: string;
  label: string;
  statusValues: string[];
  fields: string[];
};

/**
 * 教务端订单详情的履约进度步骤。
 * 这里按 2026-06-14 优化文档中的配图保留 5 个固定阶段。
 */
export const DELIVERY_PROGRESS_STAGES: readonly DeliveryProgressStage[] = [
  {
    key: 'initial',
    label: '初始',
    statusValues: ['销售建单', '待补资料', '待教务审核', '待补客户资料', '已补客户资料'],
    fields: ['statusStage'],
  },
  {
    key: 'assign',
    label: '分配老师',
    statusValues: ['待分配老师', '老师已接单', 'awaiting_teacher', '已分配老师'],
    fields: ['assignedTeacher', 'teacherWechat', 'teacherPhone', 'teacherStability'],
  },
  {
    key: 'writing',
    label: '写作审核',
    statusValues: ['写作中'],
    fields: ['innovationReviewStatus', 'innovationReviewAt', 'editorReviewStatus', 'editorReviewAt'],
  },
  {
    key: 'prepare',
    label: '投稿准备',
    statusValues: ['待投稿'],
    fields: ['authorInfoChecked'],
  },
  {
    key: 'submitted',
    label: '投稿后',
    statusValues: ['已投稿', '审稿中', '返修中', '已录用', '待见刊', '已完成', '异常处理中'],
    fields: ['paperProgress', 'nextFollowUpAt', 'lastTeacherUpdateAt'],
  },
] as const;
