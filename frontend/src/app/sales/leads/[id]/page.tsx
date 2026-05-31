'use client';

import { Button, Card, Descriptions, Form, Input, Select, Space, Tabs, Typography, message } from 'antd';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import {
  createCollaborationTask,
  createLeadFollowRecord,
  getLeadDetail,
  listLeadFollowRecords,
  updateLeadBoard,
} from '@/shared/api/leads';
import { LeadTimeline } from '@/shared/components/leads';
import { StatusTag } from '@/shared/components/status';
import { useSubmitLock } from '@/shared/hooks/useSubmitLock';
import type { LeadTimelineItem, SalesLead } from '@/shared/types/leads';

export default function SalesLeadDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const leadId = String(params.id);
  const [lead, setLead] = useState<SalesLead>();
  const [timeline, setTimeline] = useState<LeadTimelineItem[]>([]);
  const [form] = Form.useForm();
  const { submitting, run } = useSubmitLock();

  async function loadDetail() {
    const [detail, records] = await Promise.all([getLeadDetail(leadId), listLeadFollowRecords(leadId).catch(() => [])]);
    setLead(detail);
    setTimeline(records);
  }

  useEffect(() => {
    loadDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function submitFollow(values: Record<string, unknown>) {
    await run(async () => {
      await createLeadFollowRecord(leadId, values);
      await updateLeadBoard(leadId, {
        processStatus: values.processStatus,
        addStatus: values.addStatus,
        followNote: values.content,
      });
      message.success('跟进记录已保存');
      form.resetFields();
      await loadDetail();
    });
  }

  async function requestCollaboration() {
    await run(async () => {
      await createCollaborationTask({ leadId, type: 'remind_customer', reason: '销售申请运营协同处理' });
      message.success('已发起运营协同');
      router.push(`/sales/collaboration?leadId=${leadId}`);
    });
  }

  return (
    <Space direction="vertical" size={16} className="page-stack">
      <div className="toolbar-row">
        <div>
          <Typography.Title level={2}>客资详情</Typography.Title>
          <Typography.Paragraph type="secondary">查看客户来源、销售跟进和运营协同记录。</Typography.Paragraph>
        </div>
        <Space>
          <Button onClick={() => router.push('/sales/leads')}>返回列表</Button>
          <Button type="primary" onClick={requestCollaboration} loading={submitting}>申请运营协同</Button>
        </Space>
      </div>

      <Card>
        <Descriptions
          bordered
          column={{ xs: 1, md: 2 }}
          items={[
            { key: 'id', label: '客资 ID', children: leadId },
            { key: 'name', label: '客户', children: lead?.customerName ?? '详情接口待补齐' },
            { key: 'contact', label: '联系方式', children: lead?.contact ?? '-' },
            { key: 'source', label: '来源', children: lead?.source?.postTitle ?? lead?.source?.accountName ?? lead?.source?.platform ?? '-' },
            { key: 'status', label: '客资状态', children: <StatusTag kind="leadStatus" code={lead?.status ?? 'assigned'} /> },
            { key: 'addStatus', label: '添加状态', children: <StatusTag kind="addStatus" code={lead?.addStatus ?? 'not_added'} /> },
          ]}
        />
      </Card>

      <Tabs
        items={[
          {
            key: 'follow',
            label: '写跟进',
            children: (
              <Card>
                <Form form={form} layout="vertical" onFinish={submitFollow}>
                  <div className="form-grid">
                    <Form.Item name="addStatus" label="添加状态" initialValue="applied">
                      <Select
                        options={[
                          { label: '已申请添加', value: 'applied' },
                          { label: '客户未通过', value: 'not_passed' },
                          { label: '已添加通过', value: 'added' },
                        ]}
                      />
                    </Form.Item>
                    <Form.Item name="processStatus" label="处理状态" initialValue="communicating">
                      <Select
                        options={[
                          { label: '待通过', value: 'waiting_pass' },
                          { label: '沟通中', value: 'communicating' },
                          { label: '已报价', value: 'quoted' },
                          { label: '待成交', value: 'deal_pending' },
                          { label: '无效', value: 'invalid' },
                        ]}
                      />
                    </Form.Item>
                    <Form.Item className="full-row" name="content" label="跟进备注" rules={[{ required: true, message: '请输入跟进备注' }]}>
                      <Input.TextArea rows={4} placeholder="记录客户通过情况、沟通重点和下一步动作" />
                    </Form.Item>
                  </div>
                  <Button type="primary" htmlType="submit" loading={submitting}>保存跟进</Button>
                </Form>
              </Card>
            ),
          },
          {
            key: 'timeline',
            label: '时间线',
            children: (
              <Card>
                <LeadTimeline items={timeline} />
              </Card>
            ),
          },
        ]}
      />
    </Space>
  );
}
