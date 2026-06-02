'use client';

import { Button, Card, Form, Input, Select, Space, Typography, message } from 'antd';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { apiClient } from '@/shared/api/apiClient';
import { listAssignableSalesUsers, listSourceAccounts, listSourcePosts, type CatalogOption } from '@/shared/api/catalog';
import { DraftFormShell, ImageUploadField, clearDraft, saveDraft } from '@/shared/components/forms';
import { useSubmitLock } from '@/shared/hooks/useSubmitLock';

const DRAFT_KEY = 'operation.leads.new';

export default function OperationLeadNewPage() {
  const [form] = Form.useForm();
  const { submitting, run } = useSubmitLock();
  const router = useRouter();
  const accountId = Form.useWatch('accountId', form);
  const [salesUsers, setSalesUsers] = useState<CatalogOption[]>([]);
  const [accounts, setAccounts] = useState<CatalogOption[]>([]);
  const [posts, setPosts] = useState<CatalogOption[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [pasteText, setPasteText] = useState('');

  useEffect(() => {
    setCatalogLoading(true);
    Promise.all([listAssignableSalesUsers(), listSourceAccounts()])
      .then(([nextSalesUsers, nextAccounts]) => {
        setSalesUsers(nextSalesUsers);
        setAccounts(nextAccounts);
      })
      .catch((err) => {
        message.warning(err instanceof Error ? err.message : '基础数据加载失败');
      })
      .finally(() => setCatalogLoading(false));
  }, []);

  useEffect(() => {
    listSourcePosts(accountId)
      .then(setPosts)
      .catch(() => setPosts([]));
  }, [accountId]);

  async function submit(values: Record<string, unknown>) {
    try {
      await run(async () => {
        const assignedSalesUserId = values.assignedSalesUserId ? String(values.assignedSalesUserId) : undefined;
        const selectedSalesUser = salesUsers.find((item) => item.id === assignedSalesUserId);
        await apiClient.post('/leads', {
          ...values,
          assignedSalesUserId,
          assignedSalesUserName: selectedSalesUser?.name ?? '',
          status: assignedSalesUserId ? 'assigned' : 'new',
          addStatus: 'not_added',
          processStatus: 'not_contacted',
        });
        setSubmitted(true);
        clearDraft(DRAFT_KEY);
        message.success('客资已录入');
        form.resetFields();
        router.push('/operation/leads');
      });
    } catch (err) {
      message.error(err instanceof Error ? err.message : '客资提交失败，已保留当前填写内容');
    }
  }

  function parsePastedLead() {
    const parsed = parseLeadText(pasteText);
    if (!Object.keys(parsed).length) {
      message.warning('未识别到可回填字段');
      return;
    }
    form.setFieldsValue(parsed);
    message.success('已识别并回填客资信息');
  }

  return (
    <Space direction="vertical" size={16} className="page-stack">
      <div>
        <Typography.Title level={2}>客资录入</Typography.Title>
        <Typography.Paragraph type="secondary">录入客户来源和联系方式，并分配给销售继续跟进。</Typography.Paragraph>
      </div>
      <Card>
        <DraftFormShell draftKey={DRAFT_KEY} form={form}>
          <Form
            form={form}
            layout="vertical"
            onFinish={submit}
            onValuesChange={(_, values) => {
              if (!submitted) saveDraft(DRAFT_KEY, values);
            }}
            preserve
          >
            <div className="form-grid">
              <Form.Item className="full-row" label="粘贴解析">
                <Space.Compact style={{ width: '100%' }}>
                  <Input.TextArea
                    rows={3}
                    value={pasteText}
                    onChange={(event) => setPasteText(event.target.value)}
                    placeholder="粘贴客户昵称、微信/手机号、平台和需求描述"
                  />
                  <Button onClick={parsePastedLead}>识别</Button>
                </Space.Compact>
              </Form.Item>
              <Form.Item name="platform" label="来源平台" initialValue="xiaohongshu" rules={[{ required: true, message: '请选择平台' }]}>
                <Select
                  options={[
                    { label: '小红书', value: 'xiaohongshu' },
                    { label: '抖音', value: 'douyin' },
                  ]}
                />
              </Form.Item>
              <Form.Item name="accountId" label="来源账号" rules={[{ required: true, message: '请选择来源账号' }]}>
                <Select
                  showSearch
                  loading={catalogLoading}
                  optionFilterProp="label"
                  placeholder="选择来源账号"
                  options={accounts.map((item) => ({
                    label: item.platform ? `${item.name}（${item.platform}）` : item.name,
                    value: item.id,
                  }))}
                />
              </Form.Item>
              <Form.Item name="postId" label="来源作品">
                <Select
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  placeholder="选择来源作品"
                  options={posts.map((item) => ({ label: item.name, value: item.id }))}
                />
              </Form.Item>
              <Form.Item name="assignedSalesUserId" label="分配销售">
                <Select
                  allowClear
                  showSearch
                  loading={catalogLoading}
                  optionFilterProp="label"
                  placeholder={salesUsers.length > 0 ? '选择销售账号' : '暂无可分配销售账号'}
                  options={salesUsers.map((item) => ({ label: item.name, value: item.id }))}
                />
              </Form.Item>
              <Form.Item name="nickname" label="客户昵称">
                <Input placeholder="客户昵称" />
              </Form.Item>
              <Form.Item name="contactInfo" label="联系方式" rules={[{ required: true, message: '请输入联系方式' }]}>
                <Input placeholder="微信/电话/私信账号" />
              </Form.Item>
              <Form.Item name="ip" label="地区">
                <Input placeholder="省市或客户 IP 属地" />
              </Form.Item>
              <Form.Item className="full-row" name="majorContent" label="需求备注">
                <Input.TextArea rows={4} placeholder="客户诉求、专业方向和其他备注" />
              </Form.Item>
              <Form.Item className="full-row" name="captureImageUrl" label="引流截图">
                <ImageUploadField bucket="lead-captures" />
              </Form.Item>
            </div>
            <Button type="primary" htmlType="submit" loading={submitting}>提交客资</Button>
          </Form>
        </DraftFormShell>
      </Card>
    </Space>
  );
}

function parseLeadText(raw: string): Record<string, string> {
  const text = raw.trim();
  if (!text) return {};
  const result: Record<string, string> = {};
  const phone = text.match(/1[3-9]\d{9}/)?.[0];
  const wechat = text.match(/(?:微信|wx|wechat)[:：\s]*([a-zA-Z][-_a-zA-Z0-9]{5,19})/i)?.[1];
  const nickname = text.match(/(?:昵称|客户|姓名)[:：\s]*([^\s,，;；]+)/)?.[1];

  if (/抖音|douyin/i.test(text)) result.platform = 'douyin';
  if (/小红书|xiaohongshu|xhs/i.test(text)) result.platform = 'xiaohongshu';
  if (phone || wechat) result.contactInfo = phone || wechat || '';
  if (nickname) result.nickname = nickname;
  result.majorContent = text;
  return result;
}
