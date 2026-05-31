'use client';

import { Alert, Button, Card, Form, Input, InputNumber, Select, Space, Spin, Typography, message } from 'antd';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { getPostDetail, updatePost } from '@/shared/api/content';
import { ImageUploadField } from '@/shared/components/forms';
import { useSubmitLock } from '@/shared/hooks/useSubmitLock';
import type { ContentPost } from '@/shared/types/content';

type PostFormValues = {
  platform: string;
  postType?: string;
  postUrl?: string;
  title?: string;
  accountId?: string;
  copywriting?: string;
  coverImageUrl?: string;
  traffic?: number;
  likes?: number;
  comments?: number;
  favorites?: number;
  publishedAt?: string;
  note?: string;
  supervisorSuggestion?: string;
};

export default function OperationPostEditPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [form] = Form.useForm<PostFormValues>();
  const { submitting, run } = useSubmitLock();
  const [post, setPost] = useState<ContentPost>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const postId = useMemo(() => String(params.id || ''), [params.id]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError('');
      try {
        const detail = await getPostDetail(postId);
        setPost(detail);
        form.setFieldsValue({
          platform: detail.platform,
          postType: detail.postType,
          postUrl: detail.postUrl,
          title: detail.title,
          accountId: detail.accountId,
          copywriting: detail.copywriting,
          coverImageUrl: detail.coverImageUrl,
          traffic: detail.metrics.traffic,
          likes: detail.metrics.likes,
          comments: detail.metrics.comments,
          favorites: detail.metrics.favorites,
          publishedAt: detail.publishedAt,
          note: detail.note,
          supervisorSuggestion: detail.supervisorSuggestion,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : '作品详情加载失败');
      } finally {
        setLoading(false);
      }
    }

    if (postId) {
      load();
    }
  }, [form, postId]);

  async function submit(values: PostFormValues) {
    await run(async () => {
      await updatePost(postId, values);
      message.success('作品已更新');
      router.push('/operation/posts');
    });
  }

  return (
    <Space direction="vertical" size={16} className="page-stack">
      <div className="toolbar-row">
        <div>
          <Typography.Title level={2}>编辑作品</Typography.Title>
          <Typography.Paragraph type="secondary">{post?.title || '更新作品基础信息、链接、文案和互动数据。'}</Typography.Paragraph>
        </div>
        <Button onClick={() => router.push('/operation/posts')}>返回列表</Button>
      </div>

      {error ? <Alert type="warning" showIcon message="作品详情暂不可用" description={error} /> : null}

      <Spin spinning={loading}>
        <Card>
          <Form form={form} layout="vertical" onFinish={submit} preserve disabled={Boolean(error)}>
            <div className="form-grid">
              <Form.Item name="platform" label="平台" rules={[{ required: true, message: '请选择平台' }]}>
                <Select
                  options={[
                    { label: '小红书', value: 'xiaohongshu' },
                    { label: '抖音', value: 'douyin' },
                  ]}
                />
              </Form.Item>
              <Form.Item name="postType" label="作品类型">
                <Select
                  options={[
                    { label: '图文', value: 'note' },
                    { label: '视频', value: 'video' },
                    { label: '获客贴', value: 'lead_post' },
                  ]}
                />
              </Form.Item>
              <Form.Item className="full-row" name="postUrl" label="作品链接" rules={[{ required: true, message: '请输入作品链接' }]}>
                <Input placeholder="粘贴小红书/抖音作品链接" />
              </Form.Item>
              <Form.Item name="title" label="标题">
                <Input placeholder="作品标题" />
              </Form.Item>
              <Form.Item name="accountId" label="来源账号 ID">
                <Input placeholder="账号 ID" />
              </Form.Item>
              <Form.Item name="traffic" label="流量">
                <InputNumber min={0} precision={0} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="likes" label="点赞">
                <InputNumber min={0} precision={0} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="comments" label="评论">
                <InputNumber min={0} precision={0} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="favorites" label="收藏">
                <InputNumber min={0} precision={0} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="publishedAt" label="发布时间">
                <Input placeholder="YYYY-MM-DD" />
              </Form.Item>
              <Form.Item className="full-row" name="copywriting" label="文案">
                <Input.TextArea rows={4} placeholder="作品文案" />
              </Form.Item>
              <Form.Item className="full-row" name="coverImageUrl" label="封面/截图">
                <ImageUploadField bucket="post-covers" />
              </Form.Item>
              <Form.Item className="full-row" name="note" label="备注">
                <Input.TextArea rows={3} placeholder="内部备注" />
              </Form.Item>
              <Form.Item className="full-row" name="supervisorSuggestion" label="主管建议">
                <Input.TextArea rows={3} placeholder="主管复盘建议" />
              </Form.Item>
            </div>
            <Space>
              <Button type="primary" htmlType="submit" loading={submitting}>保存作品</Button>
              <Button onClick={() => router.push('/operation/posts')}>取消</Button>
            </Space>
          </Form>
        </Card>
      </Spin>
    </Space>
  );
}
