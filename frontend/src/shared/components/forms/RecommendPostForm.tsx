'use client';

import { LinkOutlined } from '@ant-design/icons';
import { Button, Card, DatePicker, Form, Input, InputNumber, Select, Space, Typography, message } from 'antd';
import dayjs from 'dayjs';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

import { apiClient } from '@/shared/api/apiClient';
import { useSubmitLock } from '@/shared/hooks/useSubmitLock';
import { mapPlatformToKey, inferPlatformFromUrl, type PlatformFormKey } from '@/shared/utils/platform-key';

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
          list.map((a: any) => ({
            id: a.id,
            name: a.name || a.accountName,
            platform: a.platform,
            accountUid: a.accountUid,
            profileUrl: a.profileUrl,
          })),
        );
      })
      .catch(() => {
        setAccountOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 监听平台字段:切换平台时只显示该平台的账号,避免小红书/抖音同名账号混在一起难选;
  // 平台字段被后端回填 / OCR 识别 / 手动选择等场景修改时,这里都会同步刷新。
  // 类型收窄到 PlatformFormKey,后续 mapPlatformToKey 比较时不需要再判空字符串。
  const platformValue = Form.useWatch('platform', form) as PlatformFormKey | undefined;
  // 平台过滤:用 mapPlatformToKey 兜底中英文("小红书"/"xiaohongshu" 都映射到同一 key);
  // 平台为空时不过滤,展示全部账号(兜底场景:账号列表是后续异步加载完成的,首次进入页面前 platform 已有值的情况)。
  const filteredAccountOptions = useMemo(() => {
    const currentKey = mapPlatformToKey(platformValue);
    if (!currentKey) return accountOptions;
    return accountOptions.filter((a) => mapPlatformToKey(a.platform) === currentKey);
  }, [accountOptions, platformValue]);

  // 平台切换时,如果之前选中的账号不属于新平台,要把 accountId 清空,
  // 否则 Select 下拉里没有这个 option,会显示成一个"空 label 的 id"看着像 bug。
  // 重要:仅当 accountOptions 已经加载完成(非空)时才执行清理——避免解析回填的瞬间
  //   accountOptions 还没就绪,误把"刚刚按新平台匹配好的 accountId"清掉。
  // 兜底兜底:accountOptions 加载完成后再跑一次(在它依赖里),所以最终结果是一致的。
  useEffect(() => {
    const currentKey = mapPlatformToKey(platformValue);
    if (!currentKey) return;
    if (accountOptions.length === 0) return;
    const selectedId = form.getFieldValue('accountId');
    if (!selectedId) return;
    const stillValid = accountOptions.some(
      (a) => a.id === selectedId && mapPlatformToKey(a.platform) === currentKey,
    );
    if (!stillValid) {
      form.setFieldsValue({ accountId: undefined });
    }
  }, [platformValue, accountOptions, form]);

  async function parsePostUrl() {
    if (parsing) return;
    const rawUrl = String(form.getFieldValue('postUrl') || '').trim();
    if (!rawUrl) {
      message.warning('请先粘贴作品链接');
      return;
    }
    const mySeq = ++parseSeqRef.current;
    setParsing(true);
    const hideLoading = message.loading('正在解析链接中，请稍等...', 0);
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
        hideLoading();
        message.warning('后端返回数据为空，请重试');
        return;
      }
      if (mySeq !== parseSeqRef.current) return;

      const nextValues: Record<string, string | number | dayjs.Dayjs | undefined> = {};
      const platformKey = mapPlatformToKey(data?.platform) || inferPlatformFromUrl(rawUrl);
      // 平台如果真要切(从老平台切到新平台),下面的"accountId 是否要清"会受它影响;
      //   显式记录"是否在切平台",用于稍后决定要不要提示用户"原账号已清空"。
      const currentPlatformKey = mapPlatformToKey(form.getFieldValue('platform'));
      const isPlatformSwitching = !!platformKey && !!currentPlatformKey && platformKey !== currentPlatformKey;
      if (platformKey) nextValues.platform = platformKey;
      if (data?.title) nextValues.title = data.title;

      // 解析成功后，标题/文案回填：
      // - 小红书：后端 title 即笔记文案，直接覆盖文案
      // - 抖音：优先用后端从页面 XPath 提取的 copywriting 直接覆盖；
      //        若 copywriting 为空则兜底用 title
      if (data?.parsed) {
        if (platformKey === 'xiaohongshu') {
          nextValues.copywriting = data.copywriting || data.title || '';
        } else if (platformKey === 'douyin') {
          nextValues.copywriting = data.copywriting || data.title || '';
        }
      }

      // 发布日期:后端能解析就用,解析不到(空串/无效)则兜底当天,避免运营被卡在"必填项"
      //   (例:抖音移动端短链/已删除作品/登录墙等场景,后端通常拿不到 publishedAt)
      //   用户已经手动选过日期时不覆盖,只看本次解析结果。
      if (data?.publishedAt) {
        nextValues.publishedAt = dayjs(data.publishedAt);
      } else if (!form.getFieldValue('publishedAt')) {
        nextValues.publishedAt = dayjs();
      }

      // 作者信息回填：优先按账号 UID 精确匹配，其次按名称模糊匹配
      // 关键：匹配到的账号必须属于解析出来的平台,否则会出现"平台=抖音 / 账号=小红书"的脏数据
      //   (后端 authorId/name 可能在跨平台撞名,前端必须按平台再校验一次)。
      let matchedAccount: AccountOption | undefined;
      if ((data?.authorId || data?.authorName) && platformKey) {
        const matchedByUid = data?.authorId
          ? accountOptions.find(
              (a) =>
                a.accountUid &&
                a.accountUid === data.authorId &&
                mapPlatformToKey(a.platform) === platformKey,
            )
          : undefined;
        const matchedByName = data?.authorName
          ? accountOptions.find((a) => {
              if (!a.name || !data.authorName) return false;
              if (mapPlatformToKey(a.platform) !== platformKey) return false;
              const n1 = a.name.trim().toLowerCase();
              const n2 = String(data.authorName).trim().toLowerCase();
              return n1 === n2 || n1.includes(n2) || n2.includes(n1);
            })
          : undefined;
        matchedAccount = matchedByUid || matchedByName;
      }
      // 提前快照旧 accountId,后面用来判断"是否真有旧账号被清掉",再决定要不要提示用户
      const oldAccountIdBefore = form.getFieldValue('accountId');
      if (matchedAccount) {
        nextValues.accountId = matchedAccount.id;
      } else if (isPlatformSwitching) {
        // 切平台时没匹配到新平台账号,显式清掉旧账号(避免后面 useEffect 隐式清空一脸懵)
        nextValues.accountId = undefined;
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

      // 切平台时把"旧账号已清"显式告知用户,避免被解析链路隐式操作一脸懵
      //   - 必须用 setFieldsValue 前的快照判断,否则读到的是新值(undefined)
      //   - 仅当"真有旧值被清"时提示,无旧账号不打扰
      if (
        isPlatformSwitching &&
        oldAccountIdBefore &&
        nextValues.accountId === undefined
      ) {
        const newPlatformDisplay = platformKey === 'douyin' ? '抖音' : '小红书';
        message.info(`已自动切换到 ${newPlatformDisplay},原账号已清空,请重新选择`);
      }

      if (data?.parsed) {
        hideLoading();
        message.success(data.coverImageUrl ? '已根据链接回填标题、指标与封面' : '已根据链接回填标题与指标');
      } else if (data?.warning) {
        hideLoading();
        message.warning(`已识别平台，但未抓取到指标：${data.warning}`);
      } else {
        hideLoading();
        message.success('已根据链接回填平台和标题');
      }
    } catch (err) {
      if (mySeq !== parseSeqRef.current) {
        hideLoading();
        return;
      }
      const nextValues: Record<string, string | dayjs.Dayjs> = {};
      const inferred = inferPlatformFromUrl(rawUrl);
      if (inferred) nextValues.platform = inferred;
      if (!form.getFieldValue('title')) nextValues.title = inferTitleFromUrl(rawUrl);
      // 解析彻底失败:publishedAt 还是空(必填项),兜底当天,避免运营卡在提交按钮上
      if (!form.getFieldValue('publishedAt')) {
        nextValues.publishedAt = dayjs();
      }
      form.setFieldsValue(nextValues);
      latestThumbRef.current = '';
      hideLoading();
      message.warning('后端解析失败，已根据域名自动识别平台');
    } finally {
      setParsing(false);
      hideLoading();
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
            <Form.Item name="accountId" label="来源账号">
              {filteredAccountOptions.length > 0 ? (
                <Select
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  placeholder="可选:留空表示未关联账号"
                  notFoundContent="当前平台暂无可用账号,可手动输入账号 ID"
                  options={filteredAccountOptions.map((a) => ({
                    value: a.id,
                    // label 只显示账号名称,后端 id 是技术字段,运营不需要看;
                    // 平台过滤后同平台下账号名基本唯一,无需 id 辅助区分
                    label: a.name || a.id,
                  }))}
                />
              ) : accountOptions.length > 0 ? (
                // 平台已选但当前平台下没有账号:回退成自由输入,允许运营手动填账号 ID
                //   (这是原页面就支持的能力,不能因为加了平台过滤就关掉)
                <Input allowClear placeholder="当前平台下无账号,可手动输入账号 ID" />
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
