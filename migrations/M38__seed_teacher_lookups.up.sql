-- M38__seed_teacher_lookups.up.sql
-- 专业方向 / 接单类型 表结构初始化 + 种子数据
-- 使用 IF NOT EXISTS 保证幂等，INSERT IGNORE 保证可重跑
-- 2026-06-14

-- ============================================================
-- 0. 建表（IF NOT EXISTS 幂等）
-- ============================================================
CREATE TABLE IF NOT EXISTS teacher_specialties (
  id          INT          AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(100) NOT NULL UNIQUE COMMENT '专业方向名称',
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='专业方向查找表（A-4 管控）';

CREATE TABLE IF NOT EXISTS teacher_order_types (
  id          INT          AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(100) NOT NULL UNIQUE COMMENT '接单类型名称',
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='接单类型查找表（A-4 管控）';

-- ============================================================
-- 专业方向种子数据
-- ============================================================
INSERT IGNORE INTO teacher_specialties (name) VALUES
('计算机科学'),
('人工智能'),
('机器学习'),
('自然语言处理'),
('计算机视觉'),
('软件工程'),
('数据科学'),
('电子工程'),
('通信工程'),
('自动化'),
('机械工程'),
('土木工程'),
('建筑学'),
('环境工程'),
('化学工程'),
('材料科学'),
('生物医学工程'),
('生物技术'),
('临床医学'),
('基础医学'),
('药学'),
('护理学'),
('公共卫生'),
('经济学'),
('金融学'),
('会计学'),
('工商管理'),
('市场营销'),
('人力资源管理'),
('教育学'),
('心理学'),
('语言学'),
('文学'),
('历史学'),
('哲学'),
('法学'),
('政治学'),
('社会学'),
('新闻传播学'),
('艺术设计'),
('音乐学'),
('体育学'),
('数学'),
('物理学'),
('化学'),
('地理学'),
('统计学'),
('农学'),
('林学'),
('畜牧兽医学');

-- ============================================================
-- 接单类型种子数据
-- ============================================================
INSERT IGNORE INTO teacher_order_types (name) VALUES
('SCI 期刊'),
('SSCI 期刊'),
('EI 期刊'),
('EI 会议'),
('CPCI 会议'),
('Scopus 期刊'),
('CSCD 期刊'),
('CSSCI 期刊'),
('北大核心'),
('科技核心'),
('普刊'),
('国际期刊'),
('硕士毕业论文'),
('博士毕业论文'),
('本科毕业论文'),
('基金申请'),
('发明专利'),
('实用新型专利'),
('软著');
