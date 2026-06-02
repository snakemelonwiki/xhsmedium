-- ============================================================
-- B 端 1.2 P1 修复 - leads 字符集脏数据核查（D/P1-01）
--
-- 背景：v1.2 验收报告 §1.2 提到 leads 中 nickname/note 含 `?` 替换字符，
--  实际核查（2026-06-02）未发现，但可能有遗漏。
--
-- 修复策略（按任务文档 D/P1-01）：
--   1) 跑下面 4 段 SQL 核查当前数据状态。
--   2) 如发现脏数据，**不自动修复**（需用户确认），只输出报告。
--   3) 涉及文件：仅核查 SQL，无代码变更。
--
-- 执行：mysql> SOURCE backend/migrations/check-d-p1-01-leads-charset.sql
-- 输出：每段 SQL 末尾会打印 row count，复制进 doc/B端-P1修复-导出+字符集.md 报告。
-- ============================================================

USE lan_dual_role_system;

-- 1) 长度不一致行（UTF-8 中文每字符 3 字节，GBK 中文每字符 2 字节，纯 ASCII 每字符 1 字节）
SELECT '1) 长度不一致 (bytes != chars)' AS check_name;
SELECT id, nickname,
       LENGTH(nickname) AS bytes,
       CHAR_LENGTH(nickname) AS chars,
       note,
       LENGTH(note) AS note_bytes,
       CHAR_LENGTH(note) AS note_chars
FROM leads
WHERE LENGTH(nickname) != CHAR_LENGTH(nickname)
   OR LENGTH(note) != CHAR_LENGTH(note)
LIMIT 20;

-- 2) 非 printable 字符（含控制字符 / 不可见 unicode）
SELECT '2) 非 printable 字符' AS check_name;
SELECT id, nickname, HEX(LEFT(nickname, 1)) AS nick_first_hex,
       note, HEX(LEFT(note, 1)) AS note_first_hex
FROM leads
WHERE nickname REGEXP '[^[:print:]]'
   OR note REGEXP '[^[:print:]]'
LIMIT 20;

-- 3) 含 GBK 替换字符 `?`（0x3F 替换乱码）
SELECT '3) 单纯 ? 替换字符' AS check_name;
SELECT id, nickname, note
FROM leads
WHERE nickname = '?' OR note = '?'
LIMIT 20;

-- 4) 不可解码的高位字节（连续 0x80-0xFF 但不是合法 UTF-8）
SELECT '4) 不可解码的高位字节' AS check_name;
SELECT id, nickname, note, HEX(nickname) AS nick_hex
FROM leads
WHERE nickname REGEXP '[\x80-\xFF]'
   OR note REGEXP '[\x80-\xFF]'
LIMIT 20;

-- 汇总
SELECT '5) leads 字符集核查汇总' AS check_name;
SELECT
  COUNT(*) AS total_rows,
  SUM(CASE WHEN LENGTH(nickname) != CHAR_LENGTH(nickname) THEN 1 ELSE 0 END) AS nickname_len_mismatch,
  SUM(CASE WHEN LENGTH(note) != CHAR_LENGTH(note) THEN 1 ELSE 0 END) AS note_len_mismatch,
  SUM(CASE WHEN nickname REGEXP '[^[:print:]]' OR note REGEXP '[^[:print:]]' THEN 1 ELSE 0 END) AS non_printable,
  SUM(CASE WHEN nickname = '?' OR note = '?' THEN 1 ELSE 0 END) AS gbk_replacement
FROM leads;
