'use client';

import { InfoCircleOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Form, Input, InputNumber, Select, Space, Typography, message } from 'antd';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { listMyDeals } from '@/shared/api/leads';

type NewDealFormValues = {
  productType: string;
  serviceType: string;
  guaranteeType?: string;
  paymentStage?: string;
  amount: number | string;
  clientRequirementNote?: string;
  leadId: string;
};

export default function SalesDealsNewPage() {
  const router = useRouter();
  const [form] = Form.useForm<NewDealFormValues>();
  const [submitting, setSubmitting] = useState(false);
  const [lastOrderCode, setLastOrderCode] = useState<string | null>(null);

  async function submit(values: NewDealFormValues) {
    setSubmitting(true);
    try {
      const { closeLeadDeal } = await import('@/shared/api/leads');
      const result = await closeLeadDeal(values.leadId, {
        productType: values.productType,
        serviceType: values.serviceType,
        guaranteeType: values.guaranteeType,
        paymentStage: values.paymentStage,
        amount: values.amount,
        clientRequirementNote: values.clientRequirementNote,
      });
      const code = result.orderCode || result.orderId || '';
      setLastOrderCode(code);
      message.success(`成交已提交，订单编号 ${code}`);
      form.resetFields();
      // 给用户 1s 反馈时间再跳转
      setTimeout(() => {
        router.push('/sales/deals');
      }, 800);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '成交提交失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Space direction="vertical" size={16} className="page-stack">
      <div className="toolbar-row">
        <div>
          <Typography.Title level={2}>新建成交</Typography.Title>
          <Typography.Paragraph type="secondary">
            录入成交信息后系统会按 ORD-YYYYMMDD-XXXXX 规则自动生成订单编号，并把订单流转到教务端。
          </Typography.Paragraph>
        </div>
        <Space>
          <Button onClick={() => router.push('/sales/deals')}>返回列表</Button>
        </Space>
      </div>

      <Card>
        <Form form={form} layout="vertical" onFinish={submit} style={{ maxWidth: 720 }}>
          <Form.Item
            name="leadId"
            label="关联客资 ID"
            rules={[{ required: true, message: '请输入客资 ID' }]}
            extra="目前从我的客资列表中点开客资详情，再点击「标记成交」按钮即可。新建页面作为应急入口保留。"
          >
            <Input placeholder="如：lead-xxxxx" />
          </Form.Item>
          <div className="form-grid">
            <Form.Item name="productType" label="产品类型" rules={[{ required: true, message: '请选择产品类型' }]}>
              <Select
                placeholder="选择产品类型"
                options={[
                  { label: '专利', value: '专利' },
                  { label: '期刊论文', value: '期刊论文' },
                  { label: '硕士毕业论文', value: '硕士毕业论文' },
                  { label: '博士毕业论文', value: '博士毕业论文' },
                  { label: '基金', value: '基金' },
                  { label: 'EI 会议', value: 'EI会议' },
                  { label: '普刊', value: '普刊' },
                  { label: '国际会议', value: '国际会议' },
                ]}
              />
            </Form.Item>
            <Form.Item name="serviceType" label="服务类型" rules={[{ required: true, message: '请选择服务类型' }]}>
              <Select
                placeholder="选择服务类型"
                options={[
                  { label: '辅导', value: '辅导' },
                  { label: '全流程', value: '全流程' },
                  { label: '润色', value: '润色' },
                  { label: '返修', value: '返修' },
                  { label: '代投', value: '代投' },
                ]}
              />
            </Form.Item>
            <Form.Item name="guaranteeType" label="保障类型">
              <Select
                allowClear
                placeholder="选择保障类型"
                options={[
                  { label: '保录', value: '保录' },
                  { label: '保盲审', value: '保盲审' },
                  { label: '不保', value: '不保' },
                ]}
              />
            </Form.Item>
            <Form.Item name="amount" label="成交金额（元）" rules={[{ required: true, message: '请输入成交金额' }]}>
              <InputNumber min={0} precision={2} style={{ width: '100%' }} placeholder="0.00" />
            </Form.Item>
            <Form.Item name="paymentStage" label="付款阶段" className="full-row">
              <Input placeholder="如：定金 / 中期 / 尾款，或单期" />
            </Form.Item>
            <Form.Item name="clientRequirementNote" label="客户要求备注" className="full-row">
              <Input.TextArea rows={3} placeholder="客户原始诉求、特殊情况等" />
            </Form.Item>
          </div>
          <Alert
            type="info"
            showIcon
            icon={<InfoCircleOutlined />}
            message="订单编号（ORD-YYYYMMDD-XXXXX）由系统按当日成交顺序自动生成，无需手动填写。"
            style={{ marginBottom: 16 }}
          />
          <Space>
            <Button type="primary" htmlType="submit" loading={submitting}>提交成交</Button>
            <Button onClick={() => router.push('/sales/deals')}>取消</Button>
          </Space>
          {lastOrderCode ? (
            <Alert
              type="success"
              showIcon
              message={`成交成功！订单编号：${lastOrderCode}`}
              style={{ marginTop: 16 }}
            />
          ) : null}
        </Form>
      </Card>
    </Space>
  );
}
