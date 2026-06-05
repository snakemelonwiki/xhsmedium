'use client';

import { Button, Card, Form, Input, message, Modal, Radio, Select, Space, Typography } from 'antd';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { apiClient } from '@/shared/api/apiClient';
import { listAssignableSalesUsers, listSourceAccounts, listSourcePosts, type CatalogOption } from '@/shared/api/catalog';
import { DraftFormShell, ImageUploadField, clearDraft, saveDraft } from '@/shared/components/forms';
import { useSubmitLock } from '@/shared/hooks/useSubmitLock';

const DRAFT_KEY = 'operation.leads.new';

type DispatchMode = 0 | 1;

export default function OperationLeadNewPage() {
  const [form] = Form.useForm();
  const { submitting, run } = useSubmitLock();
  const router = useRouter();
  const accountId = Form.useWatch('accountId', form);
  const isDispatched = Form.useWatch('isDispatched', form) as DispatchMode | undefined;
  const [salesUsers, setSalesUsers] = useState<CatalogOption[]>([]);
  const [accounts, setAccounts] = useState<CatalogOption[]>([]);
  const [posts, setPosts] = useState<CatalogOption[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [todayCount, setTodayCount] = useState(0);

  // 计算今日日期字符串
  const todayStr = (() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  })();

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

  // 已分流 → 销售字段置空（避免误传）
  useEffect(() => {
    if (isDispatched === 1) {
      form.setFieldValue('assignedSalesUserId', undefined);
    }
  }, [isDispatched, form]);

  async function submit(values: Record<string, unknown>) {
    const nextIsDispatched: DispatchMode =
      values.isDispatched === 1 || values.isDispatched === '1' ? 1 : 0;
    const assignedSalesUserId = nextIsDispatched === 1
      ? undefined
      : values.assignedSalesUserId
        ? String(values.assignedSalesUserId)
        : undefined;
    if (nextIsDispatched === 0 && !assignedSalesUserId) {
      message.error('未分流的客资必须选择销售账号');
      return;
    }
    const selectedSalesUser = assignedSalesUserId
      ? salesUsers.find((item) => item.id === assignedSalesUserId)
      : undefined;
    try {
      await run(async () => {
        await apiClient.post('/leads', {
          ...values,
          assignedSalesUserId,
          assignedSalesUserName: selectedSalesUser?.name ?? '',
          status: assignedSalesUserId ? 'assigned' : 'new',
          addStatus: 'not_added',
          processStatus: 'not_contacted',
          isDispatched: nextIsDispatched,
        });
        clearDraft(DRAFT_KEY);

        // 获取今日录入数量
        try {
          const todayFrom = `${todayStr} 00:00:00`;
          const todayTo = `${todayStr} 23:59:59`;
          const resp = await apiClient.get<{ total?: number }>('/leads', {
            query: { scope: 'self', from: todayFrom, to: todayTo, limit: 1, page: 1 },
          });
          setTodayCount((resp as any).total || 1);
        } catch {
          setTodayCount(1);
        }

        setSubmitted(true);
        message.success(nextIsDispatched === 1 ? '已录入（已分流，不进销售看板）' : '客资已录入');
      });
    } catch (err) {
      message.error(err instanceof Error ? err.message : '客资提交失败，已保留当前填写内容');
    }
  }

  function handleContinueEntry() {
    setSubmitted(false);
    form.resetFields();
  }

  function handleViewToday() {
    setSubmitted(false);
    router.push(`/operation/leads?from=${todayStr}&to=${todayStr}`);
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

  const salesRequired = isDispatched !== 1;

  return (
    <Space direction="vertical" size={16} className="page-stack">
      <div>
        <Typography.Title level={2}>客资录入</Typography.Title>
        <Typography.Paragraph type="secondary">录入客户来源和联系方式，并决定是否分给销售跟进。</Typography.Paragraph>
      </div>
      <Card>
        <DraftFormShell draftKey={DRAFT_KEY} form={form}>
          <Form
            form={form}
            layout="vertical"
            onFinish={submit}
            initialValues={{ isDispatched: 0 }}
            onValuesChange={(_, values) => {
              if (!submitted) saveDraft(DRAFT_KEY, values);
            }}
            preserve
          >
            <div className="form-grid">
              <Form.Item className="full-row" label="粘贴解析">
                <Input.TextArea
                  rows={3}
                  value={pasteText}
                  onChange={(event) => setPasteText(event.target.value)}
                  placeholder="粘贴客户昵称、微信/手机号、平台和需求描述"
                />
                <div style={{ marginTop: 8, textAlign: 'right' }}>
                  <Button onClick={parsePastedLead}>识别</Button>
                </div>
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
              <Form.Item
                name="isDispatched"
                label="是否分流"
                rules={[{ required: true, message: '请选择是否分流' }]}
              >
                <Radio.Group
                  optionType="button"
                  buttonStyle="solid"
                  onChange={() => {
                    // 切换后由 useEffect 清空销售字段
                  }}
                >
                  <Radio.Button value={0}>未分流</Radio.Button>
                  <Radio.Button value={1}>已分流</Radio.Button>
                </Radio.Group>
              </Form.Item>
              <Form.Item
                name="assignedSalesUserId"
                label="分配销售"
                rules={salesRequired ? [{ required: true, message: '未分流的客资必须选择销售' }] : []}
                tooltip={salesRequired ? undefined : '已分流客资不进销售看板，无需分配销售'}
              >
                <Select
                  allowClear
                  showSearch
                  loading={catalogLoading}
                  optionFilterProp="label"
                  disabled={!salesRequired}
                  placeholder={
                    !salesRequired
                      ? '已分流，无需分配销售'
                      : salesUsers.length > 0
                        ? '选择销售账号'
                        : '暂无可分配销售账号'
                  }
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
              <Form.Item name="requirementNote" label="需求备注">
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
      <Modal
        open={submitted}
        title="客资录入成功"
        closable={false}
        footer={
          <Space>
            <Button onClick={handleContinueEntry}>继续录入</Button>
            <Button type="primary" onClick={handleViewToday}>查看今日记录</Button>
          </Space>
        }
      >
        <Typography.Paragraph>今日已录入 <Typography.Text strong>{todayCount}</Typography.Text> 条客资</Typography.Paragraph>
      </Modal>
    </Space>
  );
}

function parseLeadText(raw: string): Record<string, string> {
  const text = raw.trim();
  if (!text) return {};
  const result: Record<string, string> = {};

  // 尝试解析结构化模板（key:value 格式）
  const lines = text.split('\n').filter((line) => line.trim());
  let isStructured = false;

  for (const line of lines) {
    const match = line.match(/^([^:：]+)[:：]\s*(.*)$/);
    if (!match) continue;

    isStructured = true;
    const [, key, value] = match;
    const keyNorm = key.trim();
    const valueNorm = value.trim();

    // 来源: 提取平台和账号名
    if (/来源|平台/.test(keyNorm)) {
      if (/抖音|douyin/i.test(valueNorm)) result.platform = 'douyin';
      if (/小红书|xiaohongshu|xhs/i.test(valueNorm)) result.platform = 'xiaohongshu';

      // 提取账号名（支持中文括号（）和英文括号()）
      const accountMatch = valueNorm.match(/[（(]([^)）]+)[)）]/);
      if (accountMatch) {
        result._accountName = accountMatch[1].trim();
      }
    }
    // 预算
    else if (/预算/.test(keyNorm) && valueNorm) {
      result.budget = valueNorm;
    }
    // 具体情况/专业/需求
    else if (/具体|专业|需求/.test(keyNorm) && valueNorm) {
      result.majorContent = valueNorm;
    }
    // 昵称
    else if (/昵称|姓名|客户/.test(keyNorm) && valueNorm) {
      result.nickname = valueNorm;
    }
    // IP/地区
    else if (/IP|地区|区域/.test(keyNorm) && valueNorm) {
      result.ip = valueNorm;
    }
    // 联系方式（微信号/电话/手机）
    else if (/微信|电话|手机|联系/.test(keyNorm) && valueNorm) {
      result.contactInfo = valueNorm;
    }
  }

  // 如果是结构化模板，直接返回
  if (isStructured) {
    // 完整文本填入需求备注
    result.requirementNote = text;
    return result;
  }

  // 非结构化文本：使用原有的正则识别逻辑
  const phone = text.match(/1[3-9]\d{9}/)?.[0];
  const wechat = text.match(/(?:微信|wx|wechat)[:：\s]*([a-zA-Z][-_a-zA-Z0-9]{5,19})/i)?.[1];
  const nickname = text.match(/(?:昵称|客户|姓名)[:：\s]*([^\s,，;；]+)/)?.[1];

  if (/抖音|douyin/i.test(text)) result.platform = 'douyin';
  if (/小红书|xiaohongshu|xhs/i.test(text)) result.platform = 'xiaohongshu';
  if (/微信|wechat/i.test(text)) result.platform = 'xiaohongshu';
  if (phone || wechat) result.contactInfo = phone || wechat || '';
  if (nickname) result.nickname = nickname;
  result.requirementNote = text;
  return result;
}
