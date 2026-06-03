-- M23 回滚：移除 M23 扩展的 4 列
ALTER TABLE import_tasks
  DROP COLUMN payload_json,
  DROP COLUMN result_json,
  DROP COLUMN error_message,
  DROP COLUMN updated_at;
