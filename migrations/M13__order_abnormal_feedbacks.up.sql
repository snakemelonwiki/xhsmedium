-- M13: 订单异常反馈独立表，用于替换原有"节点类型含异常"的字符串匹配判定
-- 表名：order_abnormal_feedbacks
-- 字段：
--   id                主键 UUID
--   order_id          关联订单
--   lead_id           关联客资
--   reporter_user_id  反馈提交人（一般为教务）
--   abnormal_type     异常类型枚举
--   description       异常描述
--   expected_helper   期望协助方
--   status            反馈状态：open / handling / closed
--   created_at        创建时间
--   updated_at        更新时间
--   closed_at         关闭时间
--   closed_by         关闭操作人
--   close_note        关闭备注
USE lan_dual_role_system;

CREATE TABLE IF NOT EXISTS order_abnormal_feedbacks (
  id                VARCHAR(64)  NOT NULL
    COMMENT '异常反馈主键ID（UUID）',
  order_id          VARCHAR(64)  NOT NULL
    COMMENT '关联订单ID（orders.id）',
  lead_id           VARCHAR(64)  NULL
    COMMENT '关联客资ID（leads.id，冗余便于查询客资维度）',
  reporter_user_id  VARCHAR(64)  NOT NULL
    COMMENT '反馈提交人ID（users.id，一般是教务）',
  abnormal_type     VARCHAR(32)  NOT NULL
    COMMENT '异常类型：client_uncooperative 客户不配合 | material_missing 素材缺失 | teacher_no_response 老师未响应 | cycle_risk 周期风险 | payment_issue 款项问题 | other 其他',
  description       TEXT         NULL
    COMMENT '异常描述',
  expected_helper   VARCHAR(32)  NULL
    COMMENT '期望协助方：sales 销售 | supervisor 主管 | operation 运营 | other 其他',
  status            VARCHAR(16)  NOT NULL DEFAULT 'open'
    COMMENT '状态：open 待处理 | handling 处理中 | closed 已关闭',
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
    COMMENT '创建时间',
  updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    COMMENT '更新时间',
  closed_at         DATETIME     NULL
    COMMENT '关闭时间',
  closed_by         VARCHAR(64)  NULL
    COMMENT '关闭操作人ID（users.id）',
  close_note        TEXT         NULL
    COMMENT '关闭备注/解决方案',
  PRIMARY KEY (id),
  KEY idx_oaf_order_id (order_id),
  KEY idx_oaf_status (status),
  KEY idx_oaf_reporter (reporter_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='订单异常反馈表：教务端可独立提交，状态机驱动 orders.orderStatus=abnormal，关闭后回退到进行中';
