'use client';

import {
  BellFilled,
  ClockCircleOutlined,
  TeamOutlined,
  UserAddOutlined,
} from '@ant-design/icons';
import { Badge, Button, Modal, Space, Tag, Typography } from 'antd';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo } from 'react';

import { useNotifications } from '@/shared/contexts/NotificationContext';
import type { NotificationItem } from '@/shared/types/notifications';

const { Title, Paragraph, Text } = Typography;

/**
 * 解析通知内容：后端发来的 content 格式可能是：
 *   平台：小红书
 *   联系方式：13800138000
 *   需求备注：需要2个月内见刊
 *
 * 把它解析成结构化对象，便于分字段渲染 + 高亮平台。
 */
type ParsedContent = {
  platform?: string;
  contact?: string;
  requirement?: string;
  raw: string;
};

function parseNotificationContent(content: string | undefined): ParsedContent {
  const raw = content || '';
  if (!raw) return { raw };

  const result: ParsedContent = { raw };
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);

  for (const line of lines) {
    if (line.includes('平台：') || line.includes('平台:')) {
      result.platform = line.split(/[：:]/)[1]?.trim();
    } else if (line.includes('联系方式：') || line.includes('联系方式:')) {
      result.contact = line.split(/[：:]/)[1]?.trim();
    } else if (line.includes('需求备注：') || line.includes('需求备注:')) {
      result.requirement = line.split(/[：:]/)[1]?.trim();
    }
  }

  return result;
}

/**
 * 高优先级跨角色通知专用的"必须确认"弹窗。
 *
 * 与右上角铃铛 / message.info toast 的区别：
 *   - 铃铛只在 header 显示红点，需要主动点开；
 *   - toast 几秒后自动消失，用户没看见就过去了；
 *   - 本弹窗：
 *       1) 强制居中、不可关闭、不可点遮罩、不可 Esc；
 *       2) 必须点击 "我已知晓" 才会关闭（同时调 markRead 写入已读）；
 *       3) 多条通知排队展示，用户逐条确认，避免叠层乱序。
 *
 * 触发时机：仅在 socket 实时推送时入队（见 NotificationContext.tsx）。
 * 初始 listNotifications / 60s 轮询拿到的历史未读 **不会** 弹窗，避免登录瞬间
 * 弹一堆遮屏的硬交互。
 */

/**
 * 类型 → 视觉装饰（图标、主色调、按钮文案）
 */
type AlertVisual = {
  icon: React.ReactNode;
  accent: string;
  tagColor: string;
  tagText: string;
  primaryActionText: string;
};

function pickVisual(type: string): AlertVisual {
  switch (type) {
    case 'lead_assigned':
      return {
        icon: <UserAddOutlined style={{ fontSize: 28, color: '#1677ff' }} />,
        accent: '#1677ff',
        tagColor: 'blue',
        tagText: '新分配客资',
        primaryActionText: '立即处理客资',
      };
    case 'collaboration_requested':
      return {
        icon: <TeamOutlined style={{ fontSize: 28, color: '#fa8c16' }} />,
        accent: '#fa8c16',
        tagColor: 'orange',
        tagText: '协同申请',
        primaryActionText: '立即处理协同',
      };
    case 'collaboration_handled':
      return {
        icon: <TeamOutlined style={{ fontSize: 28, color: '#52c41a' }} />,
        accent: '#52c41a',
        tagColor: 'green',
        tagText: '协同已处理',
        primaryActionText: '查看处理结果',
      };
    case 'reminder':
      return {
        icon: <ClockCircleOutlined style={{ fontSize: 28, color: '#eb2f96' }} />,
        accent: '#eb2f96',
        tagColor: 'magenta',
        tagText: '工作提醒',
        primaryActionText: '立即查看',
      };
    case 'order_handed_over':
      return {
        icon: <BellFilled style={{ fontSize: 28, color: '#722ed1' }} />,
        accent: '#722ed1',
        tagColor: 'purple',
        tagText: '订单交接',
        primaryActionText: '立即接单',
      };
    case 'order_accepted':
      return {
        icon: <BellFilled style={{ fontSize: 28, color: '#13c2c2' }} />,
        accent: '#13c2c2',
        tagColor: 'cyan',
        tagText: '订单已接收',
        primaryActionText: '查看订单',
      };
    default:
      return {
        icon: <BellFilled style={{ fontSize: 28, color: '#1677ff' }} />,
        accent: '#1677ff',
        tagColor: 'blue',
        tagText: '新消息',
        primaryActionText: '立即查看',
      };
  }
}

function fallbackRoute(item: NotificationItem): string | undefined {
  const type = item.targetType?.toLowerCase();
  const targetId = item.targetId;
  const normalizedPort = item.portType === 'operations' ? 'operation' : item.portType;
  if (item.routeHint) return item.routeHint;
  if (!type || targetId === undefined || targetId === null) return undefined;
  if (type.includes('lead')) {
    return normalizedPort === 'operation'
      ? `/operation/leads?leadId=${targetId}`
      : `/sales/leads/${targetId}`;
  }
  if (type.includes('collaboration')) {
    return normalizedPort === 'operation'
      ? `/operation/collaboration?taskId=${targetId}`
      : `/sales/collaboration?taskId=${targetId}`;
  }
  if (type.includes('order')) {
    if (normalizedPort === 'academic') return `/academic/orders?orderId=${targetId}`;
    if (normalizedPort === 'admin') return `/admin/orders?orderId=${targetId}`;
    return `/sales/orders/${targetId}`;
  }
  if (type.includes('reminder')) {
    if (normalizedPort === 'sales') return '/sales';
    if (normalizedPort === 'academic') return '/academic';
    return '/operation';
  }
  return undefined;
}

function formatRelativeTime(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const diff = Date.now() - t;
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  return new Date(iso).toLocaleString('zh-CN');
}

export function NotificationAlertModal() {
  const router = useRouter();
  const { pendingAlerts, dismissCurrentAlert } = useNotifications();
  const current = pendingAlerts[0];
  const remaining = pendingAlerts.length;

  const visual = useMemo<AlertVisual>(
    () => pickVisual(current?.notificationType ?? 'system'),
    [current?.notificationType],
  );

  const handleDismiss = useCallback(async () => {
    if (!current) return;
    await dismissCurrentAlert();
  }, [current, dismissCurrentAlert]);

  const handleNavigate = useCallback(async () => {
    if (!current) return;
    const route = fallbackRoute(current);
    await dismissCurrentAlert();
    if (route) router.push(route);
  }, [current, dismissCurrentAlert, router]);

  if (!current) return null;

  const targetRoute = fallbackRoute(current);
  const time = formatRelativeTime(current.createdAt);
  const parsed = parseNotificationContent(current.content);

  return (
    <Modal
      open
      // 三个"不可关闭"开关：用户必须显式点 "我已知晓" 才能关
      closable={false}
      maskClosable={false}
      keyboard={false}
      // 视觉
      centered
      width={520}
      // 标题区不用默认，自己画一个带图标 + 类型标签 + 计数的头部
      title={null}
      // 自定义底部，避免显示默认 OK/Cancel
      footer={null}
      // 多条排队时不要在切换间动画，提升节奏
      destroyOnClose={false}
      styles={{
        content: {
          borderRadius: 16,
          padding: 0,
          overflow: 'hidden',
          boxShadow: `0 16px 48px ${visual.accent}33`,
        },
      }}
    >
      {/* 头部色块：用类型主色，强提示 */}
      <div
        style={{
          background: `linear-gradient(135deg, ${visual.accent}15 0%, ${visual.accent}05 100%)`,
          borderBottom: `2px solid ${visual.accent}`,
          padding: '20px 24px 16px',
        }}
      >
        <Space size={14} align="start" style={{ width: '100%' }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: '#fff',
              border: `2px solid ${visual.accent}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              boxShadow: `0 4px 12px ${visual.accent}33`,
            }}
          >
            {visual.icon}
          </div>
          <Space direction="vertical" size={4} style={{ flex: 1, minWidth: 0 }}>
            <Space size={8} align="center" wrap>
              <Tag color={visual.tagColor} style={{ margin: 0, fontWeight: 600 }}>
                {visual.tagText}
              </Tag>
              {remaining > 1 ? (
                <Badge
                  count={`待确认 ${remaining}`}
                  style={{
                    background: '#fff',
                    color: visual.accent,
                    border: `1px solid ${visual.accent}`,
                    fontWeight: 600,
                  }}
                />
              ) : null}
              {time ? (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {time}
                </Text>
              ) : null}
            </Space>
            <Title
              level={4}
              style={{
                margin: 0,
                color: '#1f1f1f',
                fontWeight: 700,
                lineHeight: 1.4,
              }}
            >
              {current.title || '新消息提醒'}
            </Title>
          </Space>
        </Space>
      </div>

      {/* 内容区 */}
      <div style={{ padding: '20px 24px 8px' }}>
        {parsed.platform || parsed.contact || parsed.requirement ? (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            {/* 平台：醒目高亮显示 */}
            {parsed.platform ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Text type="secondary" style={{ fontSize: 14, minWidth: 80 }}>
                  平台
                </Text>
                <Tag
                  color={visual.accent}
                  style={{
                    fontSize: 16,
                    fontWeight: 700,
                    padding: '4px 16px',
                    borderRadius: 8,
                    border: `2px solid ${visual.accent}`,
                    background: `${visual.accent}15`,
                    color: visual.accent,
                    margin: 0,
                  }}
                >
                  {parsed.platform}
                </Tag>
              </div>
            ) : null}

            {/* 联系方式 */}
            {parsed.contact ? (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <Text type="secondary" style={{ fontSize: 14, minWidth: 80 }}>
                  联系方式
                </Text>
                <Text
                  style={{
                    fontSize: 15,
                    fontWeight: 600,
                    color: '#1f1f1f',
                    flex: 1,
                    wordBreak: 'break-all',
                  }}
                >
                  {parsed.contact}
                </Text>
              </div>
            ) : null}

            {/* 需求备注 */}
            {parsed.requirement ? (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <Text type="secondary" style={{ fontSize: 14, minWidth: 80 }}>
                  需求备注
                </Text>
                <Paragraph
                  style={{
                    margin: 0,
                    fontSize: 15,
                    lineHeight: 1.7,
                    color: '#434343',
                    flex: 1,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {parsed.requirement}
                </Paragraph>
              </div>
            ) : null}
          </Space>
        ) : current.content ? (
          <Paragraph
            style={{
              margin: 0,
              fontSize: 15,
              lineHeight: 1.8,
              color: '#434343',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              maxHeight: 280,
              overflowY: 'auto',
            }}
          >
            {current.content}
          </Paragraph>
        ) : (
          <Paragraph type="secondary" style={{ margin: 0 }}>
            （无附加说明）
          </Paragraph>
        )}
      </div>

      {/* 操作区：必须显式确认 */}
      <div
        style={{
          padding: '12px 24px 20px',
          background: '#fafafa',
          borderTop: '1px solid #f0f0f0',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 8,
        }}
      >
        {targetRoute ? (
          <Button size="large" onClick={handleNavigate}>
            {visual.primaryActionText}
          </Button>
        ) : null}
        <Button
          type="primary"
          size="large"
          onClick={handleDismiss}
          style={{
            minWidth: 140,
            background: visual.accent,
            borderColor: visual.accent,
            fontWeight: 600,
          }}
        >
          我已知晓
        </Button>
      </div>
    </Modal>
  );
}
