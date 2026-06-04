import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

@Entity('leads')
export class Lead {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'employee_id', length: 64 })
  employeeId: string;

  @Column({ name: 'account_id', length: 64 })
  accountId: string;

  @Column({ name: 'post_id', length: 64, nullable: true })
  postId: string | null;

  @Column({ length: 32 })
  platform: string;

  @Column({ name: 'contact_info', length: 255 })
  contactInfo: string;

  @Column({ length: 128, nullable: true })
  nickname: string | null;

  @Column({ length: 64, nullable: true })
  budget: string | null;

  @Column({ name: 'major_content', length: 255, nullable: true })
  majorContent: string | null;

  @Column({ length: 128, nullable: true })
  ip: string | null;

  @Column({ length: 32, default: 'new' })
  status: string;

  @Column({ name: 'deal_amount', type: 'decimal', precision: 12, scale: 2, nullable: true })
  dealAmount: string | null;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @Column({ name: 'requirement_note', type: 'text', nullable: true })
  requirementNote: string | null;

  @Column({ name: 'supervisor_note', type: 'text', nullable: true })
  supervisorNote: string | null;

  @Column({ name: 'capture_image_url', length: 500, nullable: true })
  captureImageUrl: string | null;

  @Column({ name: 'sales_feedback', type: 'text', nullable: true })
  salesFeedback: string | null;

  @Column({ name: 'sales_updated_at', type: 'datetime', nullable: true })
  salesUpdatedAt: Date | null;

  @Column({ name: 'sales_user_name', length: 64, nullable: true })
  salesUserName: string | null;

  @Column({ name: 'assigned_sales_user_id', length: 64, nullable: true })
  assignedSalesUserId: string | null;

  @Column({ name: 'assigned_sales_user_name', length: 64, nullable: true })
  assignedSalesUserName: string | null;

  @Column({ name: 'process_status', length: 32, default: 'not_contacted' })
  processStatus: string;

  @Column({ name: 'deal_status', length: 32, default: 'not_deal' })
  dealStatus: string;

  @Column({ name: 'add_status', length: 32, default: 'not_added' })
  addStatus: string;

  @Column({ length: 32, nullable: true })
  intention: string | null;

  @Column({ name: 'lead_code', length: 32, nullable: true })
  leadCode: string | null;

  @Column({ name: 'intention_level', length: 16, default: 'pending' })
  intentionLevel: string;

  @Column({ name: 'add_method', length: 16, default: 'unknown' })
  addMethod: string;

  @Column({ name: 'next_follow_time', type: 'datetime', nullable: true })
  nextFollowTime: Date | null;

  @Column({ name: 'matched_post_id', length: 64, nullable: true })
  matchedPostId: string | null;

  @Column({ name: 'source_unknown', type: 'tinyint', default: 0 })
  sourceUnknown: number;

  // ============================================================
  // v1.3 增量（CROSS-1 / CROSS-2，迁移 M26）
  //   CROSS-1: is_dispatched 客资分流（0=未分流/进销售看板，1=已分流/不进销售看板）
  //   CROSS-2: 销售写跟进(SA-1)和列表展示(SA-2)需要回写以下字段
  //   客户需求走 requirement_note（已存在），意向程度走 intention_level（已存在），本次不重复添加
  // ============================================================

  /**
   * 客资分流标志。
   * 0 = 未分流：销售端必选已分配，进入销售端统计/列表（销售看板、我的客资、我的成交均需 WHERE is_dispatched = 0）。
   * 1 = 已分流：不进入销售端统计，但仍出现在运营端自己的客资看板与主管端全局客资看板。
   * 默认 0；索引 idx_leads_is_dispatched 加速销售端列表过滤。
   */
  @Column({ name: 'is_dispatched', type: 'tinyint', default: 0 })
  isDispatched: number;

  /**
   * 客户学历（如：本科/硕士/博士/其他）。由销售在「写跟进」（SA-1）弹窗中维护，写入 leads 自身供列表展示（SA-2）。
   * 与作者学历（order_authors.degree）不同：作者学历是论文作者信息；本字段是销售跟进的客户本身学历。
   */
  @Column({ name: 'client_degree', length: 32, nullable: true })
  clientDegree: string | null;

  /**
   * 客户专业/研究方向。由销售在「写跟进」时填写，长度 255 以容纳"计算机科学与技术 · 人工智能方向"这类复合描述。
   * 注意：客户需求（例：需要 2 个月内见刊）走 requirement_note（已存在），本字段是"专业方向"，两者语义不重叠。
   */
  @Column({ name: 'client_major_research', length: 255, nullable: true })
  clientMajorResearch: string | null;

  /**
   * 客户时间要求（如：2 个月内、年底前、明年 3 月）。自由文本，长度 255。
   * 配合 next_follow_time 使用：客户时间要求是客户的诉求，下次跟进时间是销售/教务的计划。
   */
  @Column({ name: 'client_time_requirement', length: 255, nullable: true })
  clientTimeRequirement: string | null;

  /**
   * 异议点：客户表达出的不签单/犹豫/拒绝原因（如：太贵、再考虑、导师不同意）。自由文本。
   * 与 sales_feedback（销售反馈）区别：sales_feedback 是销售对客户的内部备注；本字段是结构化的"客户异议"。
   */
  @Column({ name: 'objection_point', type: 'text', nullable: true })
  objectionPoint: string | null;

  /**
   * 具体跟进措施（如：明天下午 3 点发修改方案、约下周一线上沟通）。销售每次跟进后写入。
   * 与 follow_action_at 配合：follow_action 记录"做了什么"，follow_action_at 记录"什么时候做的"。
   */
  @Column({ name: 'follow_action', type: 'text', nullable: true })
  followAction: string | null;

  /**
   * 具体跟进时间：本次 follow_action 写入的时间戳。
   * 索引 idx_leads_follow_action_at 加速销售端按跟进时间倒序展示。
   */
  @Column({ name: 'follow_action_at', type: 'datetime', nullable: true })
  followActionAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
