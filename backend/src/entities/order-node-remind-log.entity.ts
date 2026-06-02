import {
  Entity, PrimaryColumn, Column, CreateDateColumn, Index,
} from 'typeorm';

/**
 * 订单节点提醒幂等日志（P2-B 教务节点提醒完整规则）。
 *
 * 设计要点：
 * - 同 (order_id, rule_code) 同一天只发一次，UNIQUE 约束由数据库兜底。
 * - last_sent_at 用 DATETIME（不带 timezone 假设），与同库其他表一致。
 * - rule_code 显式列举 4 类：material_pending / teacher_pending /
 *   client_silent / delivery_due，未来扩展加新行。
 *
 * 数据生命周期：
 * - 写入：RemindersService.orderNodeDifferentiatedScan() 在判定触发
 *   通知后 upsert 写入（或在冲突时刷新 last_sent_at）。
 * - 读取：扫描时按 order_id + rule_code 查询当天是否已发。
 * - 清理：last_sent_at 超过 7 天的行可定期清理（目前未实现清理，
 *   留待量级上升后单独迁移）。
 */
@Entity('order_node_remind_log')
@Index('uk_order_rule', ['orderId', 'ruleCode'], { unique: true })
@Index('idx_order_node_remind_log_order', ['orderId'])
@Index('idx_order_node_remind_log_rule_last', ['ruleCode', 'lastSentAt'])
export class OrderNodeRemindLog {
  @PrimaryColumn({ length: 64 })
  id: string;

  @Column({ name: 'order_id', length: 64 })
  orderId: string;

  @Column({ name: 'rule_code', length: 64 })
  ruleCode: string;

  @Column({ name: 'last_sent_at', type: 'datetime' })
  lastSentAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
