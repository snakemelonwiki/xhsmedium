-- M13 回滚：删除订单异常反馈表
-- 警告：会丢失所有异常反馈记录，请确认业务无依赖后再执行
USE lan_dual_role_system;

DROP TABLE IF EXISTS order_abnormal_feedbacks;
