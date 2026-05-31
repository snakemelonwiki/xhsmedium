'use client';

import { Alert, Button, Card, Empty, Form, Input, Modal, Segmented, Select, Space, Spin, Typography, message } from 'antd';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { createLeadFollowRecord, listSalesLeads, listTomorrowFollowups, updateLeadBoard } from '@/shared/api/leads';
import { LeadCard } from '@/shared/components/leads';
import { LeadStatus, LeadAddStatus, LeadProcessStatus, CollaborationStatus } from '@/shared/constants/lead-status-enums';
import { useSubmitLock } from '@/shared/hooks/useSubmitLock';
import type { SalesLead } from '@/shared/types/leads';

type QueueKey = 'all' | 'new' | 'notPassed' | 'operationHandled' | 'due';

const queueOptions = [
  { label: '全部', value: 'all' },
  { label: '新分配', value: 'new' },
  { label: '未通过', value: 'notPassed' },
  { label: '协同后待跟进', value: 'operationHandled' },
  { label: '到期跟进', value: 'due' },
];

export default function SalesFollowupsPage() {
  const router = useRouter();
  const [items, setItems] = useState<SalesLead[]>([]);
  const [queue, setQueue] = useState<QueueKey>('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [quickLead, setQuickLead] = useState<SalesLead>();
  const [form] = Form.useForm();
  const { submitting, run } = useSubmitLock();

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [assigned, notPassed, operationHandled, inFollowup, dueFollowups] = await Promise.all([
        listSalesLeads({ pageSize: 50, status: LeadStatus.ASSIGNED }).catch(() => ({ items: [] as SalesLead[] })),
        listSalesLeads({ pageSize: 50, addStatus: LeadAddStatus.NOT_PASSED }).catch(() => ({ items: [] as SalesLead[] })),
        listSalesLeads({ pageSize: 50, status: LeadStatus.OPERATION_HANDLED }).catch(() => ({ items: [] as SalesLead[] })),
        listSalesLeads({ pageSize: 50, status: LeadStatus.IN_FOLLOWUP }).catch(() => ({ items: [] as SalesLead[] })),
        listTomorrowFollowups({ pageSize: 50 }).catch(() => ({ items: [] as SalesLead[] })),
      ]);
      setItems(dedupeLeads([...assigned.items, ...notPassed.items, ...operationHandled.items, ...inFollowup.items, ...dueFollowups.items]));
    } catch (err) {
      const text = err instanceof Error ? err.message : '待跟进客资加载失败';
      setError(text);
      message.error(text);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const visibleItems = items.filter((lead) => matchQueue(lead, queue));

  async function submitQuickFollow(values: Record<string, unknown>) {
    if (!quickLead) return;
    await run(async () => {
      const body = {
        content: values.content,
        addStatus: values.addStatus,
        processStatus: values.processStatus,
        intentionLevel: values.intentionLevel,
        nextFollowTime: values.nextFollowTime,
      };
      try {
        await createLeadFollowRecord(String(quickLead.id), body);
        await updateLeadBoard(String(quickLead.id), {
          addStatus: values.addStatus,
          processStatus: values.processStatus,
          intentionLevel: values.intentionLevel,
          followNote: values.content,
          nextFollowTime: values.nextFollowTime,
        });
        message.success('跟进记录已保存');
        setQuickLead(undefined);
        form.resetFields();
        await load();
      } catch (err) {
        message.error(err instanceof Error ? err.message : '跟进记录保存失败');
      }
    });
  }

  return (
    <Space direction="vertical" size={16} className="page-stack">
      <div className="toolbar-row">
        <div>
          <Typography.Title level={2}>待跟进</Typography.Title>
          <Typography.Paragraph type="secondary">新分配、客户未通过、运营处理完成和到达下次跟进时间的客资。</Typography.Paragraph>
        </div>
        <Space wrap>
          <Segmented value={queue} onChange={(value) => setQueue(value as QueueKey)} options={queueOptions} />
          <Button onClick={load} loading={loading}>刷新</Button>
        </Space>
      </div>
      {error ? <Alert type="warning" showIcon message={error} /> : null}
      <Spin spinning={loading}>
        <Card>
          {visibleItems.length ? (
            visibleItems.map((lead) => (
              <LeadCard
                key={lead.id}
                lead={lead}
                onOpen={(item) => router.push(`/sales/leads/${item.id}`)}
                onCollaborate={(item) => router.push(`/sales/collaboration?leadId=${item.id}`)}
                actions={<Button onClick={() => setQuickLead(lead)}>写跟进</Button>}
              />
            ))
          ) : (
            <Empty description="暂无待跟进客资" />
          )}
        </Card>
      </Spin>
      <Modal
        title={quickLead ? `写跟进 · ${quickLead.customerName || quickLead.nickname || quickLead.id}` : '写跟进'}
        open={Boolean(quickLead)}
        onCancel={() => setQuickLead(undefined)}
        footer={null}
        destroyOnClose={false}
      >
        <Form form={form} layout="vertical" onFinish={submitQuickFollow} preserve>
          <Form.Item name="addStatus" label="添加状态" initialValue={quickLead?.addStatus ?? LeadAddStatus.APPLIED}>
            <Select
              options={[
                { label: '已申请添加', value: LeadAddStatus.APPLIED },
                { label: '客户未通过', value: LeadAddStatus.NOT_PASSED },
                { label: '已添加通过', value: LeadAddStatus.ADDED },
              ]}
            />
          </Form.Item>
          <Form.Item name="processStatus" label="处理状态" initialValue={quickLead?.processStatus ?? LeadProcessStatus.COMMUNICATING}>
            <Select
              options={[
                { label: '待通过', value: LeadProcessStatus.WAITING_PASS },
                { label: '沟通中', value: LeadProcessStatus.COMMUNICATING },
                { label: '已报价', value: LeadProcessStatus.QUOTED },
                { label: '待成交', value: LeadProcessStatus.DEAL_PENDING },
                { label: '无效', value: LeadProcessStatus.INVALID },
              ]}
            />
          </Form.Item>
          <Form.Item name="intentionLevel" label="意向度">
            <Select
              allowClear
              options={[
                { label: '高意向', value: 'high' },
                { label: '中意向', value: 'medium' },
                { label: '低意向', value: 'low' },
                { label: '待判断', value: 'unknown' },
              ]}
            />
          </Form.Item>
          <Form.Item name="nextFollowTime" label="下次跟进时间">
            <Input type="datetime-local" />
          </Form.Item>
          <Form.Item name="content" label="跟进备注" rules={[{ required: true, message: '请输入跟进备注' }]}>
            <Input.TextArea rows={4} placeholder="记录本次沟通情况和下一步动作" />
          </Form.Item>
          <Space>
            <Button type="primary" htmlType="submit" loading={submitting}>保存跟进</Button>
            <Button onClick={() => setQuickLead(undefined)}>取消</Button>
          </Space>
        </Form>
      </Modal>
    </Space>
  );
}

function dedupeLeads(leads: SalesLead[]) {
  const map = new Map<string | number, SalesLead>();
  leads.forEach((lead) => map.set(lead.id, lead));
  return Array.from(map.values());
}

function matchQueue(lead: SalesLead, queue: QueueKey) {
  if (queue === 'all') return true;
  if (queue === 'new') return lead.status === LeadStatus.ASSIGNED;
  if (queue === 'notPassed') return lead.addStatus === LeadAddStatus.NOT_PASSED;
  if (queue === 'operationHandled') return lead.status === LeadStatus.OPERATION_HANDLED || lead.collaborationStatus === CollaborationStatus.HANDLED;
  if (queue === 'due') return Boolean(lead.nextFollowAt && new Date(lead.nextFollowAt).getTime() <= Date.now());
  return true;
}
