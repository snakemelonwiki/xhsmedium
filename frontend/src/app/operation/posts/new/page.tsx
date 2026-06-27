'use client';

import { LinkOutlined } from '@ant-design/icons';
import { Button, Card, DatePicker, Form, Input, InputNumber, Segmented, Select, Space, Typography, message } from 'antd';
import dayjs from 'dayjs';
import { useEffect, useMemo, useRef, useState } from 'react';

import { apiClient } from '@/shared/api/apiClient';
import { ImageUploadField } from '@/shared/components/forms';
import { useSubmitLock } from '@/shared/hooks/useSubmitLock';
import {
  mapPlatformToKey,
  inferPlatformFromUrl,
  type PlatformFormKey,
} from '@/shared/utils/platform-key';

type EntryType = 'link' | 'manual';

interface AccountOption {
  id: string;
  name?: string;
  platform?: string;
  accountUid?: string | null;
  profileUrl?: string | null;
}

export default function OperationPostNewPage() {
  const [form] = Form.useForm();
  const { submitting, run } = useSubmitLock();
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

  useEffect(() => {
    // 拉当前运营可用的账号列表,渲染为下拉;空数组时回退到自由输入框
    let cancelled = false;
    apiClient
      .get<unknown>('/accounts?limit=200')
      .then((res: any) => {
        if (cancelled) return;
        const list: any[] = Array.isArray(res) ? res : res?.items || [];
        setAccountOptions(
          list.map((a) => ({
            id: a.id,
            name: a.name || a.accountName,
            platform: a.platform,
            accountUid: a.accountUid,
            profileUrl: a.profileUrl,
          })),
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
    const hideLoading = message.loading('正在解析链接中，请稍等...', 0);
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
            /** 作品文案/描述（抖音从页面 XPath 提取） */
            copywriting?: string;
            authorName?: string;
            authorId?: string;
            likes?: number;
            comments?: number;
            favorites?: number;
            shares?: number;
            /** 抓取截图：原图 / 缩略图（同源低分辨率图）。无封面时为空串。 */
            coverImageUrl?: string;
            coverThumbUrl?: string;
            /** 发布日期（小红书页面解析，YYYY-MM-DD） */
            publishedAt?: string;
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
      const nextValues: Record<string, unknown> = {};

      // 平台：后端可能返回 '小红书'/'抖音'（中文）/ 'xiaohongshu'/'douyin'（英文），
      //   都要映射到表单值 xiaohongshu/douyin。同时用 URL 兜底识别。
      const platformKey = mapPlatformToKey(data?.platform) || inferPlatformFromUrl(rawUrl);
      // 平台如果真要切(从老平台切到新平台),下面的"accountId 是否要清"会受它影响;
      //   显式记录"是否在切平台",用于稍后决定要不要提示用户"原账号已清空"。
      const currentPlatformKey = mapPlatformToKey(form.getFieldValue('platform'));
      const isPlatformSwitching = !!platformKey && !!currentPlatformKey && platformKey !== currentPlatformKey;
      if (platformKey) {
        nextValues.platform = platformKey;
      }
      if (data?.title) {
        nextValues.title = data.title;
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

      // 解析链接成功后，粘贴新 URL 即代表要录入新作品：
      // - 后端可解析字段直接覆盖表单已有值；
      // - 后端无法解析但表单已有旧值的字段统一清回默认/空值，避免 URL A 的旧数据残留覆盖 URL B。
      // 提前快照旧 accountId,后面用来判断"是否真有旧账号被清掉",再决定要不要提示用户
      const oldAccountIdBefore = form.getFieldValue('accountId');
      if (data?.parsed === true) {
        nextValues.postUrl = rawUrl;
        nextValues.postType = '获客贴';
        nextValues.title = data.title || inferTitleFromUrl(rawUrl);
        // 发布日期:后端能解析就用,解析不到(空串/无效)则兜底当天,避免运营被卡在"必填项"
        //   (例:抖音移动端短链/已删除作品/登录墙等场景,后端通常拿不到 publishedAt)
        nextValues.publishedAt = data.publishedAt ? dayjs(data.publishedAt) : dayjs();
        nextValues.copywriting = data.copywriting || data.title || '';
        nextValues.likes = data.likes ?? 0;
        nextValues.comments = data.comments ?? 0;
        nextValues.favorites = data.favorites ?? 0;
        nextValues.shares = data.shares ?? 0;
        // accountId:有匹配就写新匹配,没匹配就保留旧值(用户已选的不轻易动);
        // 平台被切换时,如果旧账号不属于新平台,显式清空 + 下面给用户 message 提示。
        if (matchedAccount) {
          nextValues.accountId = matchedAccount.id;
        } else if (isPlatformSwitching) {
          nextValues.accountId = undefined;
        }
        nextValues.note = '';
        nextValues.coverImageUrl = data.coverImageUrl || undefined;
        latestThumbRef.current = data.coverThumbUrl || data.coverImageUrl || '';
      } else {
        // 兜底标题
        if (!nextValues.title && !form.getFieldValue('title')) {
          nextValues.title = inferTitleFromUrl(rawUrl);
        }
        // 兜底封面：只要后端返回了 coverImageUrl，就回填到表单。
        //   coverThumbUrl 通过 latestThumbRef 一并带上（与手工上传走同一条提交路径）。
        if (data.coverImageUrl) {
          nextValues.coverImageUrl = data.coverImageUrl;
          latestThumbRef.current = data.coverThumbUrl || data.coverImageUrl;
        }
        if (matchedAccount) {
          nextValues.accountId = matchedAccount.id;
        } else if (isPlatformSwitching) {
          // 兜底分支也按"切平台时显式清"处理,与上面 parsed=true 保持一致
          nextValues.accountId = undefined;
        }
        // parsed=false(已识别平台但未抓到指标)时,后端通常不返 publishedAt;
        //   兜底当天,避免必填项卡住提交。注意:用户已手动选过日期时不覆盖。
        if (!data?.publishedAt && !form.getFieldValue('publishedAt')) {
          nextValues.publishedAt = dayjs();
        }
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
        const hasCover = !!(data.coverImageUrl);
        hideLoading();
        message.success(
          hasCover
            ? '已根据链接回填标题、指标与封面'
            : '已根据链接回填标题与指标',
        );
      } else if (data?.warning) {
        hideLoading();
        message.warning(`已识别平台，但未抓取到指标：${data.warning}`);
      } else {
        hideLoading();
        message.success('已根据链接回填平台和标题');
      }
    } catch (err) {
      // 过期响应：用户在中途又粘贴了新的 URL，旧的 catch 兜底也别写表单
      if (mySeq !== parseSeqRef.current) {
        hideLoading();
        return;
      }
      // 后端解析失败时前端兜底
      const nextValues: Record<string, string | dayjs.Dayjs> = {};
      const inferred = inferPlatformFromUrl(rawUrl);
      if (inferred) {
        nextValues.platform = inferred;
      }
      if (!form.getFieldValue('title')) {
        nextValues.title = inferTitleFromUrl(rawUrl);
      }
      // 解析彻底失败:publishedAt 还是空(必填项),兜底当天,避免运营卡在提交按钮上
      if (!form.getFieldValue('publishedAt')) {
        nextValues.publishedAt = dayjs();
      }
      form.setFieldsValue(nextValues);
      // 兜底时也清掉旧的封面（避免用户看到上一个 URL 的封面残留）
      latestThumbRef.current = '';
      hideLoading();
      message.warning('后端解析失败，已根据域名自动识别平台');
    } finally {
      setParsing(false);
      hideLoading();
    }
  }

  /**
   * T10.2：粘贴截图后调后端 OCR 端点（占位），把识别结果填到表单。
   * 当前后端 OCR 引擎未启用，data.warning 会提示"请手动补充标题与账号"；
   * 表单字段保持可编辑（前端不强制覆盖非空字段），用户可手动修正。
   */
  const [ocrRunning, setOcrRunning] = useState(false);
  async function recognizeImageFromPaste(file: File) {
    setOcrRunning(true);
    try {
      const body = new FormData();
      body.set('image', file);
      const ac = new AbortController();
      const timeoutId = window.setTimeout(() => ac.abort(), 30_000);
      let payload: any;
      try {
        payload = await apiClient.post<{
          ok?: boolean;
          data?: {
            title?: string;
            accountName?: string;
            platform?: string;
            text?: string;
            ocr?: string;
            warning?: string;
          };
          error?: { code?: string; message?: string };
        }>('/parser/parse-image', body, { signal: ac.signal });
      } finally {
        window.clearTimeout(timeoutId);
      }
      if (!payload?.ok || !payload?.data) {
        message.warning(payload?.error?.message || 'OCR 识别失败，请手动输入');
        return;
      }
      const nextValues: Record<string, string> = {};
      // 只在表单为空时回填，避免覆盖用户已经输入的内容
      if (payload.data.title && !form.getFieldValue('title')) {
        nextValues.title = payload.data.title;
      }
      if (payload.data.accountName && !form.getFieldValue('accountId')) {
        // OCR 同样按"平台对齐"过滤,避免跨平台撞名:
        //   OCR 识别出"账号名 X",如果当前平台是抖音,但账号名匹配到的是小红书同名账号,就不写。
        //   后端 OCR 接口目前不返 platform 字段(占位),不强制校验;一旦后端补字段,这里立即生效。
        const ocrPlatformKey = mapPlatformToKey(payload.data.platform);
        const currentFormPlatformKey = mapPlatformToKey(form.getFieldValue('platform'));
        const matched = accountOptions.find((a) => {
          if (a.name !== payload.data.accountName && a.id !== payload.data.accountName) {
            return false;
          }
          // OCR 识别到了具体平台:要求 a.platform 与之匹配
          if (ocrPlatformKey && mapPlatformToKey(a.platform) !== ocrPlatformKey) {
            return false;
          }
          // OCR 没识别到具体平台,但当前表单平台已选:要求 a.platform 与表单平台匹配
          if (
            !ocrPlatformKey &&
            currentFormPlatformKey &&
            mapPlatformToKey(a.platform) !== currentFormPlatformKey
          ) {
            return false;
          }
          return true;
        });
        if (matched) nextValues.accountId = matched.id;
      }
      if (Object.keys(nextValues).length > 0) {
        form.setFieldsValue(nextValues);
      }
      if (payload.data.warning) {
        // 占位场景：前端要明确告诉用户"识别字段可手动修正"
        message.info(payload.data.warning);
      } else if (Object.keys(nextValues).length > 0) {
        message.success('已根据截图识别填充字段，可手动修改');
      }
    } catch (err) {
      // 静默：失败时不影响上传流程，提示一句即可
      message.warning('OCR 识别未完成（' + (err instanceof Error ? err.message : '未知错误') + '），请手动输入');
    } finally {
      setOcrRunning(false);
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

    try {
      await run(async () => {
        await apiClient.post('/posts', {
          ...values,
          accountId,
          coverThumbUrl,
          publishedAt,
        });
        message.success('作品已录入，可继续录入下一条');
        form.resetFields();
        latestThumbRef.current = '';
        // 修复 (2026-06-13)：6月11日优化意见要求提交成功后不自动跳转，
        //   停留在录入页面直接录下一个，避免重复点击"作品录入"。
      });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : '提交失败，请稍后重试';
      message.error(errMsg);
    } finally {
      setSubmittingCheck(false);
    }
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
                  { label: '讨论贴', value: '讨论贴' },
                  { label: '人设贴', value: '人设贴' },
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
            {/* 链接录入和手动录入时显示封面上传（非必填）；v1.3 / OP-12 截图录入入口已下线，保留封面图可选 */}
            <Form.Item className="full-row" name="coverImageUrl" label="封面图">
              <ImageUploadField
                bucket="post-covers"
                listenGlobalPaste
                onThumbChange={(url) => { latestThumbRef.current = url; }}
                // T10.2：粘贴截图后自动调 OCR（占位），把可识别的字段回填；
                // onPastedImage 仅在用户粘贴时触发，点击上传不会触发 OCR。
                onPastedImage={(file) => { void recognizeImageFromPaste(file); }}
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
