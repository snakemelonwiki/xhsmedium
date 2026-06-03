'use client';

import { LinkOutlined } from '@ant-design/icons';
import { Button, Card, DatePicker, Form, Input, Segmented, Select, Space, Typography, Modal, message } from 'antd';
import dayjs from 'dayjs';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { apiClient } from '@/shared/api/apiClient';
import { ImageUploadField } from '@/shared/components/forms';
import { useSubmitLock } from '@/shared/hooks/useSubmitLock';

type EntryType = 'link' | 'upload' | 'manual';

interface AccountOption {
  id: string;
  name?: string;
  platform?: string;
}

export default function OperationPostNewPage() {
  const [form] = Form.useForm();
  const { submitting, run } = useSubmitLock();
  const router = useRouter();
  const latestThumbRef = useRef<string>('');
  const [accountOptions, setAccountOptions] = useState<AccountOption[]>([]);
  const [parsing, setParsing] = useState(false);
  const [submittingCheck, setSubmittingCheck] = useState(false);
  const [entryType, setEntryType] = useState<EntryType>('link');

  useEffect(() => {
    // 拉当前运营可用的账号列表,渲染为下拉;空数组时回退到自由输入框
    let cancelled = false;
    apiClient
      .get<unknown>('/accounts?limit=200')
      .then((res: any) => {
        if (cancelled) return;
        const list: any[] = Array.isArray(res) ? res : res?.items || [];
        setAccountOptions(
          list.map((a) => ({ id: a.id, name: a.name || a.accountName, platform: a.platform })),
        );
      })
      .catch(() => {
        // 拉取失败不阻塞录入,继续走空回退
        setAccountOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * 调用后端 POST /api/posts/parse-link 解析作品链接
   */
  async function parsePostUrl() {
    const rawUrl = String(form.getFieldValue('postUrl') || '').trim();
    if (!rawUrl) {
      message.warning('请先粘贴作品链接');
      return;
    }
    setParsing(true);
    try {
      const payload = await apiClient.post<{ ok?: boolean; data?: { platform?: string; title?: string } }>(
        '/posts/parse-link',
        { postUrl: rawUrl },
      );
      const nextValues: Record<string, string> = {};
      if (payload?.data?.platform) {
        nextValues.platform = payload.data.platform;
      }
      if (payload?.data?.title && !form.getFieldValue('title')) {
        nextValues.title = payload.data.title;
      }
      // 后端未识别时前端兜底
      if (!nextValues.platform) {
        if (/douyin\.com|iesdouyin\.com/i.test(rawUrl)) {
          nextValues.platform = 'douyin';
        } else if (/xiaohongshu\.com|xhslink\.com/i.test(rawUrl)) {
          nextValues.platform = 'xiaohongshu';
        }
      }
      if (!nextValues.title && !form.getFieldValue('title')) {
        nextValues.title = inferTitleFromUrl(rawUrl);
      }
      form.setFieldsValue(nextValues);
      message.success('已根据链接回填平台和标题');
    } catch (err) {
      // 后端解析失败时前端兜底
      const nextValues: Record<string, string> = {};
      if (/douyin\.com|iesdouyin\.com/i.test(rawUrl)) {
        nextValues.platform = 'douyin';
      } else if (/xiaohongshu\.com|xhslink\.com/i.test(rawUrl)) {
        nextValues.platform = 'xiaohongshu';
      }
      if (!form.getFieldValue('title')) {
        nextValues.title = inferTitleFromUrl(rawUrl);
      }
      form.setFieldsValue(nextValues);
      message.warning('后端解析失败，已根据域名自动识别平台');
    } finally {
      setParsing(false);
    }
  }

  /**
   * 提交前检查链接是否重复
   */
  async function checkDuplicate(postUrl: string): Promise<boolean> {
    if (!postUrl) return false;
    try {
      const result = await apiClient.get<{ items?: unknown[]; total?: number }>('/posts', {
        query: { url: postUrl, limit: 1 },
      });
      const items = result?.items ?? [];
      return items.length > 0;
    } catch {
      return false;
    }
  }

  async function submit(values: Record<string, unknown>) {
    const postUrl = String(values.postUrl || '').trim();
    // ImageUploadField 内部管 thumb 状态，submit 时把最新的 thumbUrl 合并到 body
    const coverThumbUrl = latestThumbRef.current || undefined;
    // accountId 留空 / undefined 表示未关联账号,后端落空串
    const accountId =
      typeof values.accountId === 'string' && values.accountId.trim()
        ? values.accountId.trim()
        : undefined;
    // publishedAt: DatePicker 选中的 dayjs 对象转字符串
    const publishedAtRaw = values.publishedAt;
    const publishedAt = dayjs.isDayjs(publishedAtRaw)
      ? (publishedAtRaw as dayjs.Dayjs).format('YYYY-MM-DD')
      : typeof publishedAtRaw === 'string'
        ? publishedAtRaw
        : undefined;

    // 提交前检查重复
    if (postUrl) {
      setSubmittingCheck(true);
      const isDuplicate = await checkDuplicate(postUrl);
      if (isDuplicate) {
        setSubmittingCheck(false);
        message.error('该作品链接已录入，请勿重复提交');
        return;
      }
      setSubmittingCheck(false);
    }

    await run(async () => {
      await apiClient.post('/posts', {
        ...values,
        accountId,
        coverThumbUrl,
        publishedAt,
      });
      message.success('作品已录入');
      form.resetFields();
      latestThumbRef.current = '';
      const today = formatLocalDate(new Date());

      // 提示用户选择后续操作
      Modal.confirm({
        title: '作品录入成功',
        content: '请选择后续操作：',
        okText: '查看今日记录',
        cancelText: '继续录入',
        onOk: () => {
          router.push(`/operation/posts?from=${today}&to=${today}`);
        },
        onCancel: () => {
          // 留在当前页继续录入
        },
      });
    });
  }

  /**
   * 根据 entryType 获取必填字段规则
   */
  function getRequiredRules(field: string): { required: boolean; message: string }[] {
    if (field === 'postUrl') {
      return entryType === 'link' ? [{ required: true, message: '请输入作品链接' }] : [];
    }
    if (field === 'title') {
      return [{ required: true, message: '请输入标题' }];
    }
    if (field === 'publishedAt') {
      return [{ required: true, message: '请选择发布日期' }];
    }
    return [];
  }

  return (
    <Space direction="vertical" size={16} className="page-stack">
      <div>
        <Typography.Title level={2}>作品录入</Typography.Title>
        <Typography.Paragraph type="secondary">录入作品链接、平台、账号、文案和封面截图，作为客资来源使用。</Typography.Paragraph>
      </div>
      <Card>
        <Form form={form} layout="vertical" onFinish={submit} preserve>
          {/* 录入方式切换 */}
          <Form.Item label="录入方式">
            <Segmented
              value={entryType}
              onChange={(val) => {
                setEntryType(val as EntryType);
                // 切换时清空相关字段
                if (val === 'link') {
                  // 链接录入：保留 postUrl
                } else if (val === 'upload') {
                  form.setFieldsValue({ postUrl: '' });
                } else if (val === 'manual') {
                  form.setFieldsValue({ postUrl: '', platform: 'xiaohongshu', postType: 'note' });
                }
              }}
              options={[
                { label: '链接录入', value: 'link' },
                { label: '截图上传', value: 'upload' },
                { label: '手动录入', value: 'manual' },
              ]}
            />
          </Form.Item>

          <div className="form-grid">
            <Form.Item name="platform" label="平台" initialValue="xiaohongshu" rules={[{ required: true, message: '请选择平台' }]}>
              <Select
                options={[
                  { label: '小红书', value: 'xiaohongshu' },
                  { label: '抖音', value: 'douyin' },
                ]}
              />
            </Form.Item>
            <Form.Item name="postType" label="作品类型" initialValue="note">
              <Select
                options={[
                  { label: '图文', value: 'note' },
                  { label: '视频', value: 'video' },
                  { label: '获客贴', value: 'lead_post' },
                ]}
              />
            </Form.Item>

            {/* 链接录入时显示 */}
            {entryType === 'link' && (
              <Form.Item className="full-row" name="postUrl" label="作品链接" rules={getRequiredRules('postUrl')}>
                <Space.Compact style={{ width: '100%' }}>
                  <Input id="postUrl" aria-label="作品链接" placeholder="粘贴小红书/抖音作品链接" />
                  <Button icon={<LinkOutlined />} onClick={parsePostUrl} loading={parsing}>
                    解析链接
                  </Button>
                </Space.Compact>
              </Form.Item>
            )}

            {/* 截图上传时显示封面上传 */}
            {entryType === 'upload' && (
              <Form.Item className="full-row" name="coverImageUrl" label="封面/截图" rules={[{ required: true, message: '请上传封面或截图' }]}>
                <ImageUploadField
                  bucket="post-covers"
                  onThumbChange={(url) => { latestThumbRef.current = url; }}
                />
              </Form.Item>
            )}

            <Form.Item name="title" label="标题" rules={getRequiredRules('title')}>
              <Input placeholder="作品标题" />
            </Form.Item>
            <Form.Item name="publishedAt" label="发布日期" rules={getRequiredRules('publishedAt')}>
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="accountId" label="来源账号 ID">
              {accountOptions.length > 0 ? (
                <Select
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  placeholder="可选:留空表示未关联账号"
                  options={accountOptions.map((a) => ({
                    value: a.id,
                    label: a.name ? `${a.name} (${a.id})` : a.id,
                  }))}
                />
              ) : (
                <Input allowClear placeholder="可选:账号 ID(留空表示未关联账号)" />
              )}
            </Form.Item>
            <Form.Item className="full-row" name="copywriting" label="文案">
              <Input.TextArea rows={4} placeholder="作品文案或备注" />
            </Form.Item>
            {/* 链接录入和手动录入时显示封面上传（非必填） */}
            {entryType !== 'upload' && (
              <Form.Item className="full-row" name="coverImageUrl" label="封面/截图">
                <ImageUploadField
                  bucket="post-covers"
                  onThumbChange={(url) => { latestThumbRef.current = url; }}
                />
              </Form.Item>
            )}
            <Form.Item className="full-row" name="note" label="备注">
              <Input.TextArea rows={3} placeholder="备注信息" />
            </Form.Item>
          </div>
          <Button type="primary" htmlType="submit" loading={submitting || submittingCheck}>提交作品</Button>
        </Form>
      </Card>
    </Space>
  );
}

function formatLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function inferTitleFromUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    const slug = url.pathname.split('/').filter(Boolean).pop();
    return slug ? `作品 ${slug.slice(0, 24)}` : '待补充标题';
  } catch {
    return '待补充标题';
  }
}
