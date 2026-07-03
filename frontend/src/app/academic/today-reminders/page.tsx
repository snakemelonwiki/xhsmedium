import { AcademicReminderListPage } from '@/app/academic/reminders/AcademicReminderListPage';

export default function AcademicTodayRemindersPage() {
  return (
    <AcademicReminderListPage
      title="今日待提醒"
      description="订单跟进节点会固定在 10:00、15:00、18:00 三个时段提醒；展示今天到期和已过期但未确认处理的节点提醒，确认跟进后会从当前列表移除。"
      mode="today"
      emptyDescription="暂无今日待提醒"
    />
  );
}
