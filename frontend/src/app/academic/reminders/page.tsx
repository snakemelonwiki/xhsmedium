import { AcademicReminderListPage } from './AcademicReminderListPage';

export default function AcademicRemindersPage() {
  return (
    <AcademicReminderListPage
      title="节点提醒"
      description="展示未来 7 天内的节点提醒；7 天内会提前预警，到期提醒固定于 10:00、15:00、18:00 发送，到达对应日期后转入今日待提醒。"
      mode="future"
      emptyDescription="暂无未来节点提醒"
    />
  );
}