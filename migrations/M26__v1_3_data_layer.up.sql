-- ============================================================
-- M26: v1.3 数据层增量
--
-- 业务来源：doc/v1.3-四端口迭代任务清单.md §五 跨端口
--   - CROSS-1: leads 表新增 is_dispatched（客资分流）
--   - CROSS-2: leads 表销售跟进字段扩展（学历/专业研究方向/时间要求/异议点/跟进措施/跟进时间）
--   - CROSS-4: 订单编号生成器（orders.order_code + orders_order_code_seq 序列表）
--
-- 变更内容：
--   1. leads 表新增 is_dispatched 字段 + 索引
--   2. leads 表新增 6 个销售跟进字段（client_degree/client_major_research/
--      client_time_requirement/objection_point/follow_action/follow_action_at）
--   3. orders 表新增 order_code 字段 + 唯一索引
--   4. 新建 orders_order_code_seq 序列表（按日自增序号）
--
-- 备注：
--   - 客户需求走 leads.requirement_note（已存在），本次不重复添加
--   - 意向程度走 leads.intention_level（已存在），本次不重复添加
--
-- 幂等：所有 ALTER 使用 IF NOT EXISTS / DROP COLUMN IF EXISTS 兼容 MySQL 8.0+
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ============================================================
-- 1. CROSS-1 leads.is_dispatched 客资分流字段
--   0 = 未分流（销售必选，已分配销售，进入销售端看板）
--   1 = 已分流（不进入销售端统计/列表，但仍出现在运营端自己的客资看板和主管端全局客资看板）
-- ============================================================
ALTER TABLE leads ADD COLUMN IF NOT EXISTS is_dispatched TINYINT NOT NULL DEFAULT 0
  COMMENT '客资分流：0未分流(进销售看板) / 1已分流(不进销售看板)';

-- 销售端统计/列表会带 WHERE is_dispatched = 0，加索引避免全表扫描
CREATE INDEX IF NOT EXISTS idx_leads_is_dispatched ON leads (is_dispatched);

-- ============================================================
-- 2. CROSS-2 leads 销售跟进字段扩展
--   销售写跟进(SA-1)和列表展示(SA-2)需要把以下字段回写到 leads 自身；
--   客户需求走 requirement_note（已存在），本次不重复添加。
-- ============================================================

-- 客户学历
ALTER TABLE leads ADD COLUMN IF NOT EXISTS client_degree VARCHAR(32) NULL
  COMMENT '客户学历';

-- 客户专业/研究方向
ALTER TABLE leads ADD COLUMN IF NOT EXISTS client_major_research VARCHAR(255) NULL
  COMMENT '客户专业/研究方向';

-- 时间要求
ALTER TABLE leads ADD COLUMN IF NOT EXISTS client_time_requirement VARCHAR(255) NULL
  COMMENT '时间要求';

-- 异议点
ALTER TABLE leads ADD COLUMN IF NOT EXISTS objection_point TEXT NULL
  COMMENT '异议点';

-- 具体跟进措施
ALTER TABLE leads ADD COLUMN IF NOT EXISTS follow_action TEXT NULL
  COMMENT '具体跟进措施';

-- 具体跟进时间
ALTER TABLE leads ADD COLUMN IF NOT EXISTS follow_action_at DATETIME NULL
  COMMENT '具体跟进时间';

-- 跟进时间索引（销售端按跟进时间排序/筛选会用到）
CREATE INDEX IF NOT EXISTS idx_leads_follow_action_at ON leads (follow_action_at);

-- 同步 leads 表注释
ALTER TABLE leads COMMENT = '客资线索表（v1.3 增量：is_dispatched 分流 + 销售跟进 6 字段）';

-- ============================================================
-- 3. CROSS-4 订单编号：orders.order_code + orders_order_code_seq
--   订单编号规则：ORD-YYYYMMDD-XXXXX
--     - YYYYMMDD 为 UTC+8 当日日期
--     - XXXXX 为当日 5 位自增序号，从 00001 开始每日重置
--   并发安全：依赖 orders_order_code_seq 单行 (seq_date) + 行锁自增；
--   seq_date 唯一索引保证每天一行。
-- ============================================================

-- 3.1 订单表新增 order_code 字段（NULL 兼容历史数据；新增订单必须写入）
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_code VARCHAR(32) NULL
  COMMENT '订单编号（ORD-YYYYMMDD-XXXXX）';

-- 订单号唯一索引（同一订单号不允许重复）
CREATE UNIQUE INDEX IF NOT EXISTS uk_orders_order_code ON orders (order_code);

-- 3.2 序列表（按日单行）
--   - id INT AUTO_INCREMENT 仅占位用，无业务含义
--   - seq_date DATE 唯一，每天 1 行
--   - current_seq INT 当日已用最大序号（0 表示当日尚未使用）
--   - created_at/updated_at 维护时间
CREATE TABLE IF NOT EXISTS orders_order_code_seq (
  id          INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  seq_date    DATE         NOT NULL COMMENT '序号日期（YYYY-MM-DD）',
  current_seq INT          NOT NULL DEFAULT 0 COMMENT '当日已用最大序号（0 = 尚未使用）',
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE INDEX uk_orders_order_code_seq_date (seq_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='订单号序列表（按日自增）';

SET FOREIGN_KEY_CHECKS = 1;
