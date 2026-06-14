ALTER TABLE orders
  DROP COLUMN IF EXISTS backup_submission_name,
  DROP COLUMN IF EXISTS backup_submission_url,
  DROP COLUMN IF EXISTS fund_remark;
