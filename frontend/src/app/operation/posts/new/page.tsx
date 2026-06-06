'use client';

import { LinkOutlined } from '@ant-design/icons';
import { Button, Card, DatePicker, Form, Input, InputNumber, Segmented, Select, Space, Typography, message } from 'antd';
import dayjs from 'dayjs';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { apiClient } from '@/shared/api/apiClient';
import { ImageUploadField } from '@/shared/components/forms';
import { useSubmitLock } from '@/shared/hooks/useSubmitLock';
import {
  mapPlatformToKey,
  inferPlatformFromUrl,
} from '@/shared/utils/platform-key';

type EntryType = 'link' | 'manual';

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
  /**
   * 解析请求 in-flight 序号：每次粘贴/回车/按钮触发解析都 +1，
   * 响应回来时如果序号对不上（用户在中途又粘贴了新 URL）就丢弃旧响应，
   * 避免"小红书指标被抖音 URL 解析覆盖"或"老 URL 兜底标题盖住新标题"。
   */
  const parseSeqRef = useRef(0);
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
   * 后端沿用 legacy Playwright 抓取能力：成功时返回完整指标，
   * 抓取失败（如登录墙）时返回基础识别 + warning，不抛错。
   */
  async function parsePostUrl() {
    // 守卫：粘贴 + 回车 + 按钮可能同帧触发，避免重入
    if (parsing) return;
    const rawUrl = String(form.getFieldValue('postUrl') || '').trim();
    if (!rawUrl) {
      message.warning('请先粘贴作品链接');
      return;
    }
    // 每次新解析都 +1，响应回来时校验序号，过期响应直接丢弃
    const mySeq = ++parseSeqRef.current;
    setParsing(true);
    try {
      // 后端抓取链路走 Playwright（无头浏览器 + sharp 截图），
      //   实测 13s，但网络抖动/重试时可能拉到 30~60s。给个 90s 客户端超时，
      //   超时后抛 AbortError 被外层 try/catch 当成"解析失败"走域名兜底。
      const ac = new AbortController();
      const timeoutId = window.setTimeout(() => ac.abort(), 90_000);
      let payload: any;
      try {
        payload = await apiClient.post<{
          ok?: boolean;
          data?: {
            platform?: string;
            postUrl?: string;
            title?: string;
            authorName?: string;
            authorId?: string;
            likes?: number;
            comments?: number;
            favorites?: number;
            shares?: number;
            /** 抓取截图：原图 / 缩略图（同源低分辨率图）。无封面时为空串。 */
            coverImageUrl?: string;
            coverThumbUrl?: string;
            parsed?: boolean;
            warning?: string;
          };
        }>('/posts/parse-link', { postUrl: rawUrl }, { signal: ac.signal });
      } finally {
        window.clearTimeout(timeoutId);
      }

      const data = payload?.data;
      // 防御：后端可能返 ok:true 但 data 是 undefined（旧版本接口），
      //  也可能 data 里没 coverImageUrl（抓取失败但识别到平台）。
      if (!data) {
        message.warning('后端返回数据为空，请重试');
        return;
      }
      // 过期响应：用户在中途又粘贴了新的 URL，丢掉这次旧结果
      if (mySeq !== parseSeqRef.current) {
        return;
      }
      const nextValues: Record<string, string | number> = {};

      // 平台：后端可能返回 '小红书'/'抖音'（中文）/ 'xiaohongshu'/'douyin'（英文），
      //   都要映射到表单值 xiaohongshu/douyin。同时用 URL 兜底识别。
      const platformKey = mapPlatformToKey(data?.platform) || inferPlatformFromUrl(rawUrl);
      if (platformKey) {
        nextValues.platform = platformKey;
      }
      if (data?.title && !form.getFieldValue('title')) {
        nextValues.title = data.title;
      }

      // 作者信息回填：匹配账号下拉列表
      if (data?.authorName && !form.getFieldValue('accountId')) {
        const matched = accountOptions.find(
          (a) => a.name === data.authorName || a.id === data.authorId,
        );
        if (matched) {
          nextValues.accountId = matched.id;
        }
      }
      // 修复 (2026-06-05)：抓取成功时直接覆盖指标，不要"仅在未填写时回填"。
      //   旧逻辑的问题：用户先粘贴 URL A → 指标 A 写进表单（初始 0，!0=true 命中）；
      //   再粘贴 URL B → !指标A=true 时跳过回填，旧指标一直留着，看起来"没覆盖"。
      //   粘贴新 URL 即代表要录入新帖子，指标也应该是新帖子的；用户如果想保留旧值，
      //   不应该再粘贴新 URL（或者用手动录入入口）。
      //
      // 修复 (2026-06-06)：原本"指标+封面"都包在 if (data?.parsed) 里，
      //   但后端某些路径可能没设 parsed 字段（如登录墙/旧版 controller），导致封面/指标
      //   全部不写。现在改为：parsed===true 才覆盖指标；封面单独看 coverImageUrl 是否存在，
      //   只要有图就回填（哪怕 parsed=false，至少封面能用）。
      if (data?.parsed === true) {
        if (data.likes !== undefined) nextValues.likes = data.likes;
        if (data.comments !== undefined) nextValues.comments = data.comments;
        if (data.favorites !== undefined) nextValues.favorites = data.favorites;
        if (data.shares !== undefined) nextValues.shares = data.shares;
      }
      // 封面截图：只要后端返回了 coverImageUrl，就回填到表单。
      //   coverThumbUrl 通过 latestThumbRef 一并带上（与手工上传走同一条提交路径）。
      //   之前用户要自己截图再上传；现在 Playwright 在后端抓完指标顺手截一张并 sharp 压成
      //   ≤720px jpeg，前端无需任何额外操作。
      if (data.coverImageUrl) {
        nextValues.coverImageUrl = data.coverImageUrl;
        latestThumbRef.current = data.coverThumbUrl || data.coverImageUrl;
      }

      // 兜底标题
      if (!nextValues.title && !form.getFieldValue('title')) {
        nextValues.title = inferTitleFromUrl(rawUrl);
      }
      form.setFieldsValue(nextValues);

      if (data?.parsed) {
        const hasCover = !!(data.coverImageUrl);
        message.success(
          hasCover
            ? '已根据链接回填标题、指标与封面'
            : '已根据链接回填标题与指标',
        );
      } else if (data?.warning) {
        message.warning(`已识别平台，但未抓取到指标：${data.warning}`);
      } else {
        message.success('已根据链接回填平台和标题');
      }
    } catch (err) {
      // 过期响应：用户在中途又粘贴了新的 URL，旧的 catch 兜底也别写表单
      if (mySeq !== parseSeqRef.current) {
        return;
      }
      // 后端解析失败时前端兜底
      const nextValues: Record<string, string> = {};
      const inferred = inferPlatformFromUrl(rawUrl);
      if (inferred) {
        nextValues.platform = inferred;
      }
      if (!form.getFieldValue('title')) {
        nextValues.title = inferTitleFromUrl(rawUrl);
      }
      form.setFieldsValue(nextValues);
      // 兜底时也清掉旧的封面（避免用户看到上一个 URL 的封面残留）
      latestThumbRef.current = '';
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

      // 修复 (2026-06-05)：TC-OP-120 要求提交成功后直接跳转到"我的作品"今日筛选。
      //   之前用 Modal.confirm 让用户手动点"查看今日记录"——绝大多数用户点"继续录入"或
      //   关闭弹窗，体感上就是"提交后没跳转"；现在改为自动 router.push，URL 带 from/to 参数。
      router.push(`/operation/posts?from=${today}&to=${today}`);
      // 修复 (2026-06-05)：router.push 命中 Next.js 路由缓存（默认 staleTimes.dynamic 30s）
      //   时，列表页 useEffect([fromParam, toParam]) 不会重新触发，停留在旧数据上 —— 用户体感
      //   是"跳过去没数据，要刷新一下才有"。router.refresh() 让当前路由重新走一次数据流。
      router.refresh();
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
          {/* 录入方式切换：v1.3 / OP-12 移除「截图上传」入口 */}
          <Form.Item label="录入方式">
            <Segmented
              value={entryType}
              onChange={(val) => {
                setEntryType(val as EntryType);
                // 切换时清空相关字段
                if (val === 'link') {
                  // 链接录入：保留 postUrl
                } else if (val === 'manual') {
                  form.setFieldsValue({ postUrl: '', platform: 'xiaohongshu', postType: '获客贴' });
                }
              }}
              options={[
                { label: '链接录入', value: 'link' },
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
            <Form.Item name="postType" label="作品类型" initialValue="获客贴">
              <Select
                options={[
                  { label: '获客贴', value: '获客贴' },
                  { label: '话题贴', value: '话题贴' },
                  { label: '素人贴', value: '素人贴' },
                ]}
              />
            </Form.Item>

            {/* 链接录入时显示 */}
            {entryType === 'link' && (
              <Form.Item
                className="full-row"
                name="postUrl"
                label="作品链接"
                rules={getRequiredRules('postUrl')}
                // v1.3 / OP-12 录入格式参考：分 PC 端 / 移动端 4 个示例，
                // 防止用户粘贴时把"复制打开抖音"/"先复制一下，再到【小红书】打开查看笔记"等
                // 移动端短链提示文案当成有效 URL。
                extra={
                  <div style={{ fontSize: 12, lineHeight: 1.7, marginTop: 6 }}>
                    <div style={{ marginBottom: 2 }}>
                      <Typography.Text type="secondary">链接格式参考（PC / 移动端均可，支持小红书、抖音）：</Typography.Text>
                    </div>
                    <div>
                      <Typography.Text type="secondary">小红书 PC：</Typography.Text>
                      <Typography.Text code style={{ wordBreak: 'break-all' }}>
                        https://www.xiaohongshu.com/explore/6a10628c000000003601e998?xsec_token=ABzF2uWcIoCcLPbYEnhpAv2a6zuEw8VcxVnE-kP1NV9x4=&xsec_source=pc_feed
                      </Typography.Text>
                    </div>
                    <div>
                      <Typography.Text type="secondary">小红书 移动端：</Typography.Text>
                      <Typography.Text code style={{ wordBreak: 'break-all' }}>
                        http://xhslink.com/o/617iP8AGqq2
                      </Typography.Text>
                      <Typography.Text type="secondary">（移动端链接常带"先复制一下，再到【小红书】打开查看笔记"等中文提示，粘贴时只取 URL 部分）</Typography.Text>
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
                      <Typography.Text type="secondary">（移动端链接可能含 <code>hbn:/ 04/28 ...</code> 等短链片段，取 https:// 开头至第一个空格的 URL）</Typography.Text>
                    </div>
                  </div>
                }
              >
                <Space.Compact style={{ width: '100%' }}>
                  <Input
                    id="postUrl"
                    aria-label="作品链接"
                    placeholder="粘贴小红书/抖音作品链接,粘贴后自动解析"
                    // 粘贴/回车都触发解析；setTimeout 让 form value 先落定
                    onPaste={() => setTimeout(() => parsePostUrl(), 200)}
                    onPressEnter={() => parsePostUrl()}
                  />
                  <Button icon={<LinkOutlined />} onClick={parsePostUrl} loading={parsing}>
                    解析链接
                  </Button>
                </Space.Compact>
              </Form.Item>
            )}

            <Form.Item name="title" label="标题" rules={getRequiredRules('title')}>
              <Input placeholder="作品标题" />
            </Form.Item>
            <Form.Item name="publishedAt" label="发布日期" rules={getRequiredRules('publishedAt')}>
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>

            {/* 互动指标：链接录入时由"解析链接"自动回填，手动录入时用户自填；必填 0 起步 */}
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
            {/* 链接录入和手动录入时显示封面上传（非必填）；v1.3 / OP-12 截图录入入口已下线，保留封面图可选 */}
            <Form.Item className="full-row" name="coverImageUrl" label="封面图">
              <ImageUploadField
                bucket="post-covers"
                onThumbChange={(url) => { latestThumbRef.current = url; }}
              />
            </Form.Item>
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

// mapPlatformToKey 已从 @/shared/utils/platform-key 导入，不再在页面内重复定义
