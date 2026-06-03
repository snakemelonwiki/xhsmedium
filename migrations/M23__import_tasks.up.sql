-- M23: 导入任务表扩展字段，支持异步队列模式
-- 旧 import_tasks 表只有 10 列（id/import_type/user_id/total_count/success_count/
--   fail_count/status/error_file_url/created_at/finished_at），未含 payload_json /
--   result_json / error_message / updated_at。本次扩展 4 列。
--
-- 字段说明：
-- - payload_json: 存储上传文件 URL 或粘贴原始数据
-- - result_json: 存储成功/失败明细
-- - error_message: 存储最终错误信息
-- - updated_at: TypeORM @UpdateDateColumn 必需（实体定义见 import-task.entity.ts）

ALTER TABLE import_tasks
  ADD COLUMN payload_json JSON NULL COMMENT '上传文件URL或粘贴原始数据' AFTER status,
  ADD COLUMN result_json JSON NULL COMMENT '成功/失败明细' AFTER payload_json,
  ADD COLUMN error_message TEXT NULL COMMENT '最终错误信息' AFTER result_json,
  ADD COLUMN updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间' AFTER created_at;
