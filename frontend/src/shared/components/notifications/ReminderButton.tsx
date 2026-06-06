'use client';

import { BellOutlined } from '@ant-design/icons';
import { Button, Form, Input, Modal, Segmented, Space, Typography, message } from 'antd';
import type { ButtonProps } from 'antd';
import { useState } from 'react';

import {
  createReminder,
  REMINDER_PRIORITIES,
  REMINDER_RECIPIENT_ROLE_LABELS,
  type CreateReminderPayload,
  type ReminderPriority,
  type ReminderRecipientRole,
  type ReminderRelatedType,
} from '@/shared/api/reminders';

export type ReminderButtonProps = Omit<ButtonProps, 'onClick'> & {
  /** 收件人用户 ID（users.id） */
  recipientId: string;
  /** 收件人姓名（用于 modal 头部展示，替代裸 ID） */
  recipientName?: string;
  /** 收件人角色：销售/运营/主管 */
  recipientRole: ReminderRecipientRole;
  /** 关联业务对象类型：lead / order / post / account；可选 */
  relatedType?: ReminderRelatedType;
  /** 关联业务对象 ID；可选 */
  relatedId?: string;
  /** 关联业务对象的可读标题（如 lead.customerName），用于 modal 展示，替代裸 ID */
  relatedTitle?: string;
  /**
   * 提醒内容默认值（弹出 modal 内的 textarea 初值）。
   * 注意：用户仍可在 modal 中编辑/覆盖。
   */
  content?: string;
  /** 提交成功后回调，参数为后端返回的 notification id（可空） */
  onSuccess?: (notificationId: string) => void;
};

/**
 * 通用"提醒"按钮（v1.3 CROSS-3）。
 *
 * 业务背景：销售/运营/主管三角色可在任意业务对象（lead/order/post/account）
 * 上向其他角色发送提醒。本组件封装 modal + POST /api/reminders 调用，
 * 供 Wave 2b/2c/2f/2g 等 subagent 在客资/订单/作品/账号详情里直接嵌入。
 *
 * 接入示例（销售端 → 运营端）：
 *   <ReminderButton
 *     recipientId={operatorUserId}
 *     recipientRole="operation"
 *     relatedType="lead"
 *     relatedId={lead.id}
 *     content={`请关注客资 ${lead.customerName} 的最新跟进情况`}
 *   >
 *     提醒运营
 *   </ReminderButton>
 */
export function ReminderButton({
  recipientId,
  recipientName,
  recipientRole,
  relatedType,
  relatedId,
  relatedTitle,
  content: defaultContent = '',
  onSuccess,
  children,
  disabled,
  ...buttonProps
}: ReminderButtonProps) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [priority, setPriority] = useState<ReminderPriority>('normal');
  const [form] = Form.useForm<{ content: string }>();

  if (!recipientId) {
    // 收件人为空时直接渲染禁用按钮，避免误点
    return (
      <Button {...buttonProps} icon={<BellOutlined />} disabled>
        {children ?? '发送提醒'}
      </Button>
    );
  }

  const openModal = () => {
    form.setFieldsValue({ content: defaultContent });
    setPriority('normal');
    setOpen(true);
  };

  const closeModal = () => {
    if (submitting) return;
    setOpen(false);
    form.resetFields();
  };

  const handleSubmit = async () => {
    let values: { content: string };
    try {
      values = await form.validateFields();
    } catch {
      // antd 已经把错误写到 form 上，阻止 submit
      return;
    }
    setSubmitting(true);
    try {
      const payload: CreateReminderPayload = {
        recipientId,
        recipientRole,
        relatedType,
        relatedId,
        content: values.content.trim(),
        priority,
      };
      const result = await createReminder(payload);
      message.success('提醒已发送');
      setOpen(false);
      form.resetFields();
      if (onSuccess) {
        onSuccess(result?.notification?.id || '');
      }
    } catch (err) {
      const text = err instanceof Error ? err.message : '提醒发送失败';
      // 401 已被 apiClient 走 clearToken + throw AuthExpiredError
      message.error(text);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Button
        {...buttonProps}
        icon={buttonProps.icon ?? <BellOutlined />}
        onClick={openModal}
        disabled={disabled || submitting}
      >
        {children ?? '发送提醒'}
      </Button>

      <Modal
        title="发送提醒"
        open={open}
        onCancel={closeModal}
        onOk={handleSubmit}
        confirmLoading={submitting}
        okText="发送"
        cancelText="取消"
        destroyOnClose
        maskClosable={false}
      >
        <Space direction="vertical" size={12} className="page-stack" style={{ width: '100%' }}>
          <Typography.Text type="secondary">
            收件人角色：<Typography.Text strong>{REMINDER_RECIPIENT_ROLE_LABELS[recipientRole] || recipientRole}</Typography.Text>
            <span style={{ marginLeft: 12 }}>
              收件人：<Typography.Text strong>{recipientName || '未命名'}</Typography.Text>
            </span>
          </Typography.Text>
          <Form form={form} layout="vertical" preserve={false}>
            <Form.Item
              name="content"
              label="提醒内容"
              rules={[
                { required: true, message: '提醒内容不能为空' },
                { max: 100, message: '提醒内容最多 100 字' },
              ]}
            >
              <Input.TextArea
                rows={4}
                placeholder="请输入提醒内容（最多 100 字）"
                showCount
                maxLength={100}
              />
            </Form.Item>
            <Form.Item label="优先级">
              <Segmented<ReminderPriority>
                options={REMINDER_PRIORITIES.map((p) => ({
                  label: p === 'urgent' ? '紧急' : '普通',
                  value: p,
                }))}
                value={priority}
                onChange={(v) => setPriority(v)}
              />
            </Form.Item>
          </Form>
          {relatedType && relatedId ? (
            <Typography.Text type="secondary">
              关联业务对象：<Typography.Text strong>{relatedTitle || `${relatedType}#${String(relatedId).slice(0, 8)}`}</Typography.Text>
            </Typography.Text>
          ) : null}
        </Space>
      </Modal>
    </>
  );
}
