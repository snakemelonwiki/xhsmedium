-- 清理负载测试产生的数据

USE lan_dual_role_system;

-- 1. 统计测试数据
SELECT '=== 测试数据统计 ===' as '';
SELECT
  '客资' as 类型,
  COUNT(*) as 数量
FROM leads
WHERE note = '负载测试数据'
UNION ALL
SELECT
  '作品' as 类型,
  COUNT(*) as 数量
FROM posts
WHERE note = '负载测试数据';

-- 2. 删除测试客资
DELETE FROM leads WHERE note = '负载测试数据';
SELECT CONCAT('已删除 ', ROW_COUNT(), ' 条测试客资') as 结果;

-- 3. 删除测试作品
DELETE FROM posts WHERE note = '负载测试数据';
SELECT CONCAT('已删除 ', ROW_COUNT(), ' 条测试作品') as 结果;

-- 4. 清理孤立的跟进记录（如果有）
DELETE FROM lead_follow_records
WHERE lead_id NOT IN (SELECT id FROM leads);
SELECT CONCAT('已删除 ', ROW_COUNT(), ' 条孤立跟进记录') as 结果;

-- 5. 验证清理结果
SELECT '=== 清理后统计 ===' as '';
SELECT
  '客资' as 类型,
  COUNT(*) as 剩余数量
FROM leads
WHERE note = '负载测试数据'
UNION ALL
SELECT
  '作品' as 类型,
  COUNT(*) as 剩余数量
FROM posts
WHERE note = '负载测试数据';

-- 可选：删除测试用户（如果不再需要）
-- 取消下面的注释以删除测试用户
/*
DELETE FROM users
WHERE username IN (
  'staff1', 'staff2', 'staff3', 'staff4', 'staff5',
  'staff6', 'staff7', 'staff8', 'staff9', 'staff10',
  'staff11', 'staff12', 'staff13', 'staff14', 'staff15',
  'sales1', 'sales2', 'sales3', 'sales4', 'sales5',
  'sales6', 'sales7', 'sales8', 'sales9', 'sales10',
  'sales11', 'sales12', 'sales13', 'sales14', 'sales15',
  'admin2', 'admin3', 'admin4', 'admin5', 'admin6',
  'academic02', 'academic03', 'academic04', 'academic05', 'academic06',
  'academic07', 'academic08', 'academic09', 'academic10', 'academic11'
);
SELECT CONCAT('已删除 ', ROW_COUNT(), ' 个测试用户') as 结果;
*/

SELECT '=== 清理完成 ===' as '';
