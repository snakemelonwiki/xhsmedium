'use client';

import { LinkOutlined } from '@ant-design/icons';
import { Button, Card, DatePicker, Form, Input, InputNumber, Select, Space, Typography, message } from 'antd';
import dayjs from 'dayjs';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { apiClient } from '@/shared/api/apiClient';
import { useSubmitLock } from '@/shared/hooks/useSubmitLock';
import { mapPlatformToKey, inferPlatformFromUrl } from '@/shared/utils/platform-key';

import { ImageUploadField } from './ImageUploadField';

interface AccountOption {
  id: string;
  name?: string;
  platform?: string;
  accountUid?: string | null;
  profileUrl?: string | null;
}

export interface RecommendPostFormProps {
  /** 提交成功后的跳转路径；不传则留在当前页并 reset 表单 */
  afterSubmitRedirect?: string;
  /** 页面标题 */
  pageTitle?: string;
  /** 页面副标题 */
  pageSubtitle?: string;
  /** 提交按钮文案 */
  submitLabel?: string;
}

/**
 * 推荐作品录入表单 — 各端共用。
 * 与作品录入（operation/posts/new）逻辑一致，区别在于：
 * 1. 标题 / 副标题由调用方传入
 * 2. 提交后可跳转或留在当前页
 * 3. 不含 postType / 录入方式切换（推荐作品统一走链接录入 + 手动补充）
 */
export function RecommendPostForm({
  afterSubmitRedirect,
  pageTitle = '推荐作品录入',
  pageSubtitle = '录入推荐作品的链接和基本信息，提交后自动解析指标。',
  submitLabel = '提交推荐作品',
}: RecommendPostFormProps) {
  const [form] = Form.useForm();
  const { submitting, run } = useSubmitLock();
  const router = useRouter();
  const latestThumbRef = useRef<string>('');
  const parseSeqRef = useRef(0);
  const [accountOptions, setAccountOptions] = useState<AccountOption[]>([]);
  const [parsing, setParsing] = useState(false);
  const [submittingCheck, setSubmittingCheck] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get<unknown>('/accounts?limit=200')
      .then((res: any) => {
        if (cancelled) return;
        const list: any[] = Array.isArray(res) ? res : res?.items || [];
        setAccountOptions(
          list.map((a: any) => ({ id: a.id, name: a.name || a.accountName, platform: a.platform })),
        );
      })
      .catch(() => {
        setAccountOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function parsePostUrl() {
    if (parsing) return;
    const rawUrl = String(form.getFieldValue('postUrl') || '').trim();
    if (!rawUrl) {
      message.warning('请先粘贴作品链接');
      return;
    }
    const mySeq = ++parseSeqRef.current;
    setParsing(true);
    try {
      const ac = new AbortController();
      const timeoutId = window.setTimeout(() => ac.abort(), 90_000);
      let payload: any;
      try {
        payload = await apiClient.post('/posts/parse-link', { postUrl: rawUrl }, { signal: ac.signal });
      } finally {
        window.clearTimeout(timeoutId);
      }

      const data = (payload as any)?.data;
      if (!data) {
        message.warning('后端返回数据为空，请重试');
        return;
      }
      if (mySeq !== parseSeqRef.current) return;

      const nextValues: Record<string, string | number> = {};
      const platformKey = mapPlatformToKey(data?.platform) || inferPlatformFromUrl(rawUrl);
      if (platformKey) nextValues.platform = platformKey;
      if (data?.title) nextValues.title = data.title;
      if (data?.parsed && data?.title && !form.getFieldValue('copywriting') && data?.platform === '抖音') {
        nextValues.copywriting = data.title;
      }
      // 作者信息回填：优先按账号 UID 精确匹配，其次按名称模糊匹配
      if (data?.authorId || data?.authorName) {
        const matchedByUid = data?.authorId
          ? accountOptions.find((a) => a.accountUid && a.accountUid === data.authorId)
          : undefined;
        const matchedByName = data?.authorName
          ? accountOptions.find((a) => {
              if (!a.name || !data.authorName) return false;
              const n1 = a.name.trim().toLowerCase();
              const n2 = String(data.authorName).trim().toLowerCase();
              return n1 === n2 || n1.includes(n2) || n2.includes(n1);
            })
          : undefined;
        const matched = matchedByUid || matchedByName;
        if (matched) nextValues.accountId = matched.id;
      }
      if (data?.parsed === true) {
        if (data.likes !== undefined) nextValues.likes = data.likes;
        if (data.comments !== undefined) nextValues.comments = data.comments;
        if (data.favorites !== undefined) nextValues.favorites = data.favorites;
        if (data.shares !== undefined) nextValues.shares = data.shares;
      }
      if (data.coverImageUrl) {
        nextValues.coverImageUrl = data.coverImageUrl;
        latestThumbRef.current = data.coverThumbUrl || data.coverImageUrl;
      }
      if (!nextValues.title && !form.getFieldValue('title')) {
        nextValues.title = inferTitleFromUrl(rawUrl);
      }
      form.setFieldsValue(nextValues);

      // 发布日期：小红书解析成功后回填
      if (data?.publishedAt) {
        form.setFieldValue('publishedAt', dayjs(data.publishedAt));
      }

      if (data?.parsed) {
        message.success(data.coverImageUrl ? '已根据链接回填标题、指标与封面' : '已根据链接回填标题与指标');
      } else if (data?.warning) {
        message.warning(`已识别平台，但未抓取到指标：${data.warning}`);
      } else {
        message.success('已根据链接回填平台和标题');
      }
    } catch (err) {
      if (mySeq !== parseSeqRef.current) return;
      const nextValues: Record<string, string> = {};
      const inferred = inferPlatformFromUrl(rawUrl);
      if (inferred) nextValues.platform = inferred;
      if (!form.getFieldValue('title')) nextValues.title = inferTitleFromUrl(rawUrl);
      form.setFieldsValue(nextValues);
      latestThumbRef.current = '';
      message.warning('后端解析失败，已根据域名自动识别平台');
    } finally {
      setParsing(false);
    }
  }

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
    const coverThumbUrl = latestThumbRef.current || undefined;
    const accountId =
      typeof values.accountId === 'string' && values.accountId.trim()
        ? values.accountId.trim()
        : undefined;
    const publishedAtRaw = values.publishedAt;
    const publishedAt = dayjs.isDayjs(publishedAtRaw)
      ? (publishedAtRaw as dayjs.Dayjs).format('YYYY-MM-DD')
      : typeof publishedAtRaw === 'string'
        ? publishedAtRaw
        : undefined;

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
      message.success('推荐作品已录入');
      form.resetFields();
      latestThumbRef.current = '';

      if (afterSubmitRedirect) {
        router.push(afterSubmitRedirect);
        router.refresh();
      }
    });
  }

  return (
    <Space direction="vertical" size={16} className="page-stack">
      <div>
        <Typography.Title level={2}>{pageTitle}</Typography.Title>
        <Typography.Paragraph type="secondary">{pageSubtitle}</Typography.Paragraph>
      </div>
      <Card>
        <Form form={form} layout="vertical" onFinish={submit} preserve>
          <div className="form-grid">
            <Form.Item name="platform" label="平台" initialValue="xiaohongshu" rules={[{ required: true, message: '请选择平台' }]}>
              <Select
                options={[
                  { label: '小红书', value: 'xiaohongshu' },
                  { label: '抖音', value: 'douyin' },
                ]}
              />
            </Form.Item>
            <Form.Item name="postType" label="作品类型" initialValue="获客贴">
              <Select
                options={[
                  { label: '获客贴', value: '获客贴' },
                  { label: '话题贴', value: '话题贴' },
                  { label: '素人贴', value: '素人贴' },
                ]}
              />
            </Form.Item>

            <Form.Item
              className="full-row"
              name="postUrl"
              label="作品链接"
              rules={[{ required: true, message: '请输入作品链接' }]}
              extra={
                <div style={{ fontSize: 12, lineHeight: 1.7, marginTop: 6 }}>
                  <div style={{ marginBottom: 2 }}>
                    <Typography.Text type="secondary">链接格式参考（PC / 移动端均可，支持小红书、抖音）：</Typography.Text>
                  </div>
                  <div>
                    <Typography.Text type="secondary">小红书 PC：</Typography.Text>
                    <Typography.Text code style={{ wordBreak: 'break-all' }}>
                      https://www.xiaohongshu.com/explore/6a10628c000000003601e998
                    </Typography.Text>
                  </div>
                  <div>
                    <Typography.Text type="secondary">小红书 移动端：</Typography.Text>
                    <Typography.Text code style={{ wordBreak: 'break-all' }}>
                      http://xhslink.com/o/617iP8AGqq2
                    </Typography.Text>
                  </div>
                  <div>
                    <Typography.Text type="secondary">抖音 PC：</Typography.Text>
                    <Typography.Text code style={{ wordBreak: 'break-all' }}>
                      https://www.douyin.com/note/7631056454430192458
                    </Typography.Text>
                  </div>
                  <div>
                    <Typography.Text type="secondary">抖音 移动端：</Typography.Text>
                    <Typography.Text code style={{ wordBreak: 'break-all' }}>
                      https://v.douyin.com/ghF491o8e6w/
                    </Typography.Text>
                  </div>
                </div>
              }
            >
              <Space.Compact style={{ width: '100%' }}>
                <Input
                  aria-label="作品链接"
                  placeholder="粘贴小红书/抖音作品链接,粘贴后自动解析"
                  onPaste={() => setTimeout(() => parsePostUrl(), 200)}
                  onPressEnter={() => parsePostUrl()}
                />
                <Button icon={<LinkOutlined />} onClick={parsePostUrl} loading={parsing}>
                  解析链接
                </Button>
              </Space.Compact>
            </Form.Item>

            <Form.Item name="title" label="标题" rules={[{ required: true, message: '请输入标题' }]}>
              <Input placeholder="作品标题" />
            </Form.Item>
            <Form.Item name="publishedAt" label="发布日期" rules={[{ required: true, message: '请选择发布日期' }]}>
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>

            <Form.Item name="likes" label="点赞数" initialValue={0}>
              <InputNumber min={0} precision={0} style={{ width: '100%' }} placeholder="0" />
            </Form.Item>
            <Form.Item name="comments" label="评论数" initialValue={0}>
              <InputNumber min={0} precision={0} style={{ width: '100%' }} placeholder="0" />
            </Form.Item>
            <Form.Item name="favorites" label="收藏数" initialValue={0}>
              <InputNumber min={0} precision={0} style={{ width: '100%' }} placeholder="0" />
            </Form.Item>
            <Form.Item name="shares" label="转发数" initialValue={0}>
              <InputNumber min={0} precision={0} style={{ width: '100%' }} placeholder="0" />
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
            <Form.Item className="full-row" name="coverImageUrl" label="封面图">
              <ImageUploadField
                bucket="post-covers"
                listenGlobalPaste
                onThumbChange={(url) => { latestThumbRef.current = url; }}
              />
            </Form.Item>
            <Form.Item className="full-row" name="note" label="备注">
              <Input.TextArea rows={3} placeholder="备注信息" />
            </Form.Item>
          </div>
          <Button type="primary" htmlType="submit" loading={submitting || submittingCheck}>{submitLabel}</Button>
        </Form>
      </Card>
    </Space>
  );
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
