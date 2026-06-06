'use client';

import {
  CalendarOutlined,
  EditOutlined,
  EyeOutlined,
  MessageOutlined,
  PlusOutlined,
  UserSwitchOutlined,
} from '@ant-design/icons';
import {
  Badge,
  Button,
  Card,
  Empty,
  Form,
  Input,
  Modal,
  Pagination,
  Popover,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { apiClient } from '@/shared/api/apiClient';
import { readAuthenticatedUser } from '@/shared/auth/auth';
import { useNotifications } from '@/shared/contexts/NotificationContext';
import { formatDateTime } from '@/shared/utils/date-format';

type Account = {
  id: string;
  employeeId: string;
  employeeName?: string;
  platform: string;
  accountName: string;
  accountUid?: string | null;
  profileUrl?: string | null;
  persona?: string | null;
  positioning?: string | null;
  postingPlan?: string | null;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
};

type SupervisorSuggestion = {
  id: string;
  targetType: string;
  targetId: string;
  content: string;
  createdAt: string;
  authorName?: string;
};

// 获取主管建议
async function fetchSupervisorSuggestions(accountId: string): Promise<SupervisorSuggestion[]> {
  try {
    const payload = await apiClient.get<{ items?: SupervisorSuggestion[] }>('/supervisor-suggestions', {
      query: { targetType: 'account', targetId: accountId },
    });
    return payload?.items ?? [];
  } catch {
    return [];
  }
}

const STATUS_OPTIONS = [
  { label: '正常', value: '正常' },
  { label: '停用', value: '停用' },
  { label: 'active', value: 'active' },
  { label: 'inactive', value: 'inactive' },
];

const PLATFORM_OPTIONS = [
  { label: '小红书', value: '小红书' },
  { label: '抖音', value: '抖音' },
  { label: 'xiaohongshu', value: 'xiaohongshu' },
  { label: 'douyin', value: 'douyin' },
];

/**
 * 运营端账号管理
 * - 只展示当前运营负责的账号
 * - 支持编辑账号信息
 * - 支持查看主管建议
 * - 支持跳转到作品、客资、日历
 */
export default function OperationAccountsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  /** 学习榜单等场景深链：?id=xxx 精准按主键查该账号（不走 search 模糊匹配） */
  const pinnedAccountId = searchParams.get('id') ?? '';
  const { unreadCount } = useNotifications();
  const [user, setUser] = useState(() => typeof window === 'undefined' ? null : readAuthenticatedUser());

  const [items, setItems] = useState<Account[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(false);

  const [platform, setPlatform] = useState<string>();
  const [keyword, setKeyword] = useState('');

  // 编辑弹窗状态
  const [editOpen, setEditOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [editForm] = Form.useForm();

  // 主管建议弹窗状态
  const [suggestions, setSuggestions] = useState<SupervisorSuggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsAccount, setSuggestionsAccount] = useState<Account | null>(null);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);

  async function load(
    nextPage = page,
    nextPageSize = pageSize,
    pf = platform,
    kw = keyword,
    id: string = pinnedAccountId,
  ) {
    setLoading(true);
    try {
      const query: Record<string, string | number> = {
        limit: nextPageSize,
        offset: (nextPage - 1) * nextPageSize,
      };
      // 深链 ?id=xxx：按主键精准查，不走 search 模糊匹配
      if (id) {
        query.id = id;
      } else {
        if (pf) query.platform = pf;
        if (kw) query.search = kw;
        // 运营只能看自己的账号
        if (user?.employeeId) {
          query.employeeId = user.employeeId;
        }
      }

      const payload = await apiClient.get<any>('/accounts', { query });
      const data = payload?.items ?? payload ?? [];
      const totalCount = payload?.total ?? data.length;
      setItems(Array.isArray(data) ? data : []);
      setTotal(totalCount);
      setPage(nextPage);
      setPageSize(nextPageSize);
    } catch {
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setUser(readAuthenticatedUser());
  }, []);

  // 深链 ?id=xxx：把 ID 同步到搜索输入框（让用户可见），并触发首次精准查询
  useEffect(() => {
    if (pinnedAccountId) {
      setKeyword(pinnedAccountId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinnedAccountId]);

  useEffect(() => {
    void load(1, 20);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.employeeId]);

  /**
   * 用户在搜索框内清空时：移除 URL 的 ?id= 参数，回到全列表。
   * （使用 allowClear 触发的 onChange 此时 v === ''）
   */
  function handleKeywordChange(v: string) {
    setKeyword(v);
    if (pinnedAccountId && v === '') {
      const next = new URLSearchParams(Array.from(searchParams.entries()));
      next.delete('id');
      const qs = next.toString();
      router.replace(qs ? `/operation/accounts?${qs}` : '/operation/accounts');
    }
  }

  const handleEdit = useCallback((record: Account) => {
    setEditingAccount(record);
    editForm.setFieldsValue({
      platform: record.platform,
      accountName: record.accountName,
      accountUid: record.accountUid ?? '',
      persona: record.persona ?? '',
      positioning: record.positioning ?? '',
      postingPlan: record.postingPlan ?? '',
      status: record.status ?? '正常',
    });
    setEditOpen(true);
  }, [editForm]);

  const handleNewAccount = useCallback(() => {
    setEditingAccount(null);
    editForm.setFieldsValue({
      platform: '小红书',
      accountName: '',
      accountUid: '',
      persona: '',
      positioning: '',
      postingPlan: '',
      status: '正常',
    });
    setEditOpen(true);
  }, [editForm]);

  const handleEditSubmit = useCallback(async (values: Record<string, string>) => {
    try {
      const body: Record<string, string> = {
        platform: values.platform,
        accountName: values.accountName,
        accountUid: values.accountUid || '',
        persona: values.persona || '',
        positioning: values.positioning || '',
        postingPlan: values.postingPlan || '',
        status: values.status,
      };

      if (editingAccount) {
        await apiClient.patch(`/accounts/${editingAccount.id}`, body);
        message.success('账号信息已更新');
      } else {
        // 新增时需要 employeeId
        if (user?.employeeId) {
          body.employeeId = user.employeeId;
        }
        await apiClient.post('/accounts', body);
        message.success('账号已创建');
      }
      setEditOpen(false);
      editForm.resetFields();
      await load(page, pageSize, platform, keyword);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '保存失败');
    }
  }, [editingAccount, editForm, load, page, pageSize, platform, keyword, user?.employeeId]);

  const handleViewSuggestions = useCallback(async (record: Account) => {
    setSuggestionsAccount(record);
    setSuggestionsOpen(true);
    setSuggestionsLoading(true);
    try {
      const data = await fetchSupervisorSuggestions(record.id);
      setSuggestions(data);
    } catch {
      setSuggestions([]);
    } finally {
      setSuggestionsLoading(false);
    }
  }, []);

  const handleViewPosts = useCallback((record: Account) => {
    router.push(`/operation/posts?accountId=${record.id}`);
  }, [router]);

  const handleViewLeads = useCallback((record: Account) => {
    router.push(`/operation/leads?accountId=${record.id}`);
  }, [router]);

  const handleViewCalendar = useCallback((record: Account) => {
    router.push(`/operation/calendar?accountId=${record.id}`);
  }, [router]);

  const getStatusColor = (status?: string | null) => {
    if (!status) return 'default';
    const lower = status.toLowerCase();
    if (lower === '正常' || lower === 'active') return 'green';
    if (lower === '停用' || lower === 'inactive') return 'red';
    return 'default';
  };

  const columns: ColumnsType<Account> = [
    { title: '账号名', dataIndex: 'accountName', width: 140, render: (v, r) => r.profileUrl ? <a href={r.profileUrl} target="_blank" rel="noreferrer">{v}</a> : v },
    { title: '平台', dataIndex: 'platform', width: 90, render: (v) => <Tag>{v || '-'}</Tag> },
    { title: 'UID', dataIndex: 'accountUid', width: 140, ellipsis: true, render: (v) => v || '-' },
    { title: '所属员工', dataIndex: 'employeeName', width: 100, render: (v) => v || '-' },
    { title: '人设', dataIndex: 'persona', ellipsis: true, render: (v) => v || '-' },
    { title: '定位', dataIndex: 'positioning', ellipsis: true, render: (v) => v || '-' },
    {
      title: '发帖规划',
      dataIndex: 'postingPlan',
      ellipsis: true,
      width: 160,
      render: (v) => v ? <Tooltip title={v}><span>{v}</span></Tooltip> : '-',
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 80,
      render: (v) => <Tag color={getStatusColor(v)}>{v || '-'}</Tag>,
    },
    {
      title: '主管建议',
      width: 100,
      render: (_v, r) => (
        <Button
          type="link"
          size="small"
          icon={<MessageOutlined />}
          onClick={() => handleViewSuggestions(r)}
        >
          查看建议
        </Button>
      ),
    },
    {
      title: '操作',
      width: 220,
      render: (_v, r) => (
        <Space size={4}>
          <Tooltip title="编辑">
            <Button type="text" size="small" icon={<EditOutlined />} onClick={() => handleEdit(r)} />
          </Tooltip>
          <Tooltip title="查看作品">
            <Button type="text" size="small" icon={<EyeOutlined />} onClick={() => handleViewPosts(r)} />
          </Tooltip>
          <Tooltip title="查看客资">
            <Button type="text" size="small" icon={<UserSwitchOutlined />} onClick={() => handleViewLeads(r)} />
          </Tooltip>
          <Tooltip title="查看日历">
            <Button type="text" size="small" icon={<CalendarOutlined />} onClick={() => handleViewCalendar(r)} />
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <Space direction="vertical" size={16} className="page-stack">
      {/* 顶部标题栏 */}
      <div className="toolbar-row">
        <div>
          <Typography.Title level={2}>
            <Space>
              账号管理
              {unreadCount > 0 && <Badge count={unreadCount} overflowCount={99} />}
            </Space>
          </Typography.Title>
          <Typography.Paragraph type="secondary">
            {user?.role === 'operation' ? `当前运营：${user?.name || user?.id || '未知'}` : '查看运营账号、平台和定位信息'}
          </Typography.Paragraph>
        </div>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={handleNewAccount}
          style={{ display: ['admin', 'owner', 'supervisor'].includes(user?.role as string) ? 'inline-flex' : 'none' }}
        >
          新增账号
        </Button>
      </div>

      {/* 筛选区 */}
      <Card>
        <Space size={12} wrap style={{ marginBottom: 16 }}>
          <Select
            allowClear
            placeholder="平台"
            style={{ width: 120 }}
            value={platform}
            onChange={(v) => { setPlatform(v); void load(1, pageSize, v, keyword); }}
            options={PLATFORM_OPTIONS}
          />
          <Input.Search
            allowClear
            placeholder="搜索账号名 / UID（支持输入账号ID精准查询）"
            style={{ width: 240 }}
            value={keyword}
            onChange={(e) => handleKeywordChange(e.target.value)}
            onSearch={(v) => load(1, pageSize, platform, v)}
          />
        </Space>

        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={items}
          rowClassName={(record) => (pinnedAccountId && record.id === pinnedAccountId ? 'ant-table-row-selected' : '')}
          pagination={false}
          locale={{ emptyText: <Empty description="暂无账号" /> }}
        />

        <Pagination
          current={page}
          pageSize={pageSize}
          total={total}
          showSizeChanger
          onChange={(p, ps) => load(p, ps)}
          style={{ marginTop: 16, textAlign: 'right' }}
        />
      </Card>

      {/* 编辑账号弹窗 */}
      <Modal
        title={editingAccount ? '编辑账号' : '新增账号'}
        open={editOpen}
        onCancel={() => { setEditOpen(false); editForm.resetFields(); }}
        onOk={() => editForm.submit()}
        destroyOnClose
      >
        <Form form={editForm} layout="vertical" onFinish={handleEditSubmit}>
          <Form.Item name="accountName" label="账号名" rules={[{ required: true, message: '请输入账号名' }]}>
            <Input placeholder="请输入账号名" />
          </Form.Item>
          <Form.Item name="platform" label="平台" rules={[{ required: true, message: '请选择平台' }]}>
            <Select placeholder="请选择平台" options={PLATFORM_OPTIONS} />
          </Form.Item>
          <Form.Item name="accountUid" label="UID">
            <Input placeholder="请输入账号UID（可选）" />
          </Form.Item>
          <Form.Item name="persona" label="人设">
            <Input.TextArea placeholder="请输入账号人设描述（可选）" rows={2} />
          </Form.Item>
          <Form.Item name="positioning" label="定位">
            <Input.TextArea placeholder="请输入账号定位（可选）" rows={2} />
          </Form.Item>
          <Form.Item name="postingPlan" label="发帖规划">
            <Input.TextArea placeholder="请输入发帖规划（可选）" rows={3} />
          </Form.Item>
          <Form.Item name="status" label="状态" initialValue="正常">
            <Select options={STATUS_OPTIONS} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 主管建议弹窗 */}
      <Modal
        title={`主管建议 - ${suggestionsAccount?.accountName || ''}`}
        open={suggestionsOpen}
        onCancel={() => { setSuggestionsOpen(false); setSuggestions([]); }}
        footer={null}
        width={600}
      >
        {suggestionsLoading ? (
          <Typography.Text type="secondary">加载中...</Typography.Text>
        ) : suggestions.length > 0 ? (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            {suggestions.map((s) => (
              <Card key={s.id} size="small">
                <Typography.Text type="secondary">
                  {formatDateTime(s.createdAt)}
                  {s.authorName && ` · ${s.authorName}`}
                </Typography.Text>
                <div style={{ marginTop: 8 }}>{s.content}</div>
              </Card>
            ))}
          </Space>
        ) : (
          <Empty description="暂无主管建议" />
        )}
      </Modal>
    </Space>
  );
}
