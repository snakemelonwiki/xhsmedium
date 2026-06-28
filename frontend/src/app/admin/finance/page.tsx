'use client';

import { App, Button, Card, DatePicker, Form, Input, Modal, Select, Space, Statistic, Table, Tabs, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';

import { listOrderIncome, listTeacherPayments, listOtherExpenses, createTeacherPayment, updateTeacherPayment, deleteTeacherPayment, createOtherExpense, updateOtherExpense, deleteOtherExpense } from '@/shared/api/finance';
import { paidStatusMeta, orderStatusMeta } from '@/shared/api/enums';
import type { OrderIncomeRow, TeacherPaymentRow, OtherExpenseRow, OrderIncomeSummary } from '@/shared/api/finance';

const { Title, Paragraph, Text } = Typography;

// ==================== 金额格式化 ====================
function fmtMoney(n: number | undefined): string {
  if (n === undefined || n === null) return '-';
  return `¥${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(s?: string | null): string {
  if (!s) return '-';
  const d = dayjs(s);
  return d.isValid() ? d.format('YYYY-MM-DD HH:mm') : '-';
}

// ==================== 订单收入 Tab ====================
function OrderIncomeTab() {
  const { message: messageApi } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<OrderIncomeRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [keyword, setKeyword] = useState('');
  const [summary, setSummary] = useState<OrderIncomeSummary>({
    totalAmount: 0,
    totalClientPaid: 0,
    totalTeacherPaid: 0,
    totalOtherExpense: 0,
    totalProfit: 0,
  });

  async function load(p = page) {
    setLoading(true);
    try {
      const res = await listOrderIncome({
        page: p,
        pageSize,
        ...(startDate ? { startDate: dayjs(startDate).format('YYYY-MM-DD') } : {}),
        ...(endDate ? { endDate: dayjs(endDate).format('YYYY-MM-DD') } : {}),
        ...(keyword ? { keyword } : {}),
      });
      setItems(res.items);
      setTotal(res.total);
      setSummary(res.summary);
      setPage(p);
    } catch (err: any) {
      messageApi.error(err?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate, keyword]);

  const columns: ColumnsType<OrderIncomeRow> = [
    { title: '订单编号', dataIndex: 'orderCode', key: 'orderCode', width: 150, fixed: 'left' },
    { title: '客户', dataIndex: 'customerName', key: 'customerName', width: 120 },
    {
      title: '合同总金额', dataIndex: 'orderAmount', key: 'orderAmount', width: 130,
      align: 'right', render: (v: number) => <Text strong type="success">{fmtMoney(v)}</Text>,
    },
    {
      title: '已回款', dataIndex: 'clientPaid', key: 'clientPaid', width: 130,
      align: 'right', render: (v: number) => fmtMoney(v),
    },
    {
      title: '定金', key: 'deposit', width: 120, align: 'center',
      render: (_v, record) => <StageCell stage={record.deposit} />,
    },
    {
      title: '中期', key: 'midterm', width: 120, align: 'center',
      render: (_v, record) => <StageCell stage={record.midterm} />,
    },
    {
      title: '尾款', key: 'final', width: 120, align: 'center',
      render: (_v, record) => <StageCell stage={record.final} />,
    },
    {
      title: '订单支出', key: 'orderExpense', width: 130,
      align: 'right',
      render: (_v, record: OrderIncomeRow) => {
        const total = (record.teacherPaid || 0) + (record.otherExpense || 0);
        return <Text type="danger">{fmtMoney(total)}</Text>;
      },
    },
    {
      title: '已支付老师', dataIndex: 'teacherPaid', key: 'teacherPaid', width: 130,
      align: 'right', render: (v: number) => <Text type="danger">{fmtMoney(v)}</Text>,
    },
    {
      title: '利润', dataIndex: 'profit', key: 'profit', width: 130,
      align: 'right', render: (v: number) => <Text strong type={v >= 0 ? 'success' : 'danger'}>{fmtMoney(v)}</Text>,
    },
    {
      title: '订单状态', dataIndex: 'orderStatus', key: 'orderStatus', width: 120, align: 'center',
      render: (v: string) => {
        const meta = orderStatusMeta(v);
        return <Tag color={meta.color}>{meta.label}</Tag>;
      },
    },
    {
      title: '付款状态', dataIndex: 'paidStatus', key: 'paidStatus', width: 120, align: 'center',
      render: (v: string) => {
        const meta = paidStatusMeta(v);
        return <Tag color={meta.color}>{meta.label}</Tag>;
      },
    },
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', width: 160, align: 'center', render: (v: string) => fmtDate(v) },
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <div className="metric-grid">
        <Card><Statistic title="订单总额" value={summary.totalAmount} precision={2} prefix="¥" /></Card>
        <Card><Statistic title="已回款" value={summary.totalClientPaid} precision={2} prefix="¥" /></Card>
        <Card><Statistic title="订单总支出" value={summary.totalTeacherPaid + summary.totalOtherExpense} precision={2} prefix="¥" /></Card>
        <Card><Statistic title="总利润" value={summary.totalProfit} precision={2} prefix="¥" valueStyle={{ color: summary.totalProfit >= 0 ? '#3f8600' : '#cf1322' }} /></Card>
      </div>
      <Space wrap>
        <DatePicker.RangePicker
          onChange={(dates) => { setStartDate(dates?.[0]?.format('YYYY-MM-DD') ?? ''); setEndDate(dates?.[1]?.format('YYYY-MM-DD') ?? ''); }}
          placeholder={['开始日期', '结束日期']}
        />
        <Input.Search allowClear placeholder="搜索订单编号/客户" style={{ width: 220 }} onSearch={setKeyword} />
        <Button onClick={() => void load()}>刷新</Button>
      </Space>
      <Table<OrderIncomeRow>
        rowKey="orderId"
        size="small"
        columns={columns}
        dataSource={items}
        loading={loading}
        pagination={{ current: page, pageSize, total, onChange: (p) => void load(p) }}
        scroll={{ x: 'max-content' }}
      />
    </Space>
  );
}

function StageCell({ stage }: { stage: { amount: number; paidAt?: string | null; source?: string } | null }) {
  if (!stage) return <Text type="secondary">-</Text>;
  const isAuto = stage.source === 'sales_close';
  return (
    <Space direction="vertical" size={0} style={{ minHeight: 48, justifyContent: 'center' }}>
      <Text strong type="success">{fmtMoney(stage.amount)}</Text>
      <Text type="secondary" style={{ fontSize: 12 }}>{fmtDate(stage.paidAt)}</Text>
      {isAuto ? <Tag color="blue">来自销售端</Tag> : <span style={{ height: 22 }} />}
    </Space>
  );
}

// ==================== 订单支出 Tab（老师付款） ====================
function TeacherPaymentTab() {
  const { message: messageApi } = App.useApp();
  const [items, setItems] = useState<TeacherPaymentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<TeacherPaymentRow | undefined>();
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [form] = Form.useForm();

  async function load(p = page) {
    setLoading(true);
    try {
      const res = await listTeacherPayments({ page: p, pageSize });
      setItems(res.items);
      setTotal(res.total);
      setPage(p);
    } catch (err: any) {
      messageApi.error(err?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(values: any) {
    try {
      if (editing) {
        await updateTeacherPayment(editing.id, values);
        messageApi.success('更新成功');
      } else {
        await createTeacherPayment(values);
        messageApi.success('创建成功');
      }
      setDrawerOpen(false);
      setEditing(undefined);
      form.resetFields();
      await load();
    } catch (err: any) {
      messageApi.error(err?.message || '操作失败');
    }
  }

  async function handleDelete(id: string) {
    Modal.confirm({
      title: '确认删除？',
      onOk: async () => {
        try {
          await deleteTeacherPayment(id);
          messageApi.success('已删除');
          await load();
        } catch (err: any) {
          messageApi.error(err?.message || '删除失败');
        }
      },
    });
  }

  const columns: ColumnsType<TeacherPaymentRow> = [
    { title: '订单ID', dataIndex: 'orderId', key: 'orderId', width: 180 },
    { title: '老师ID', dataIndex: 'teacherId', key: 'teacherId', width: 180 },
    { title: '阶段', dataIndex: 'stageLabel', key: 'stageLabel', width: 100, render: (v: string, r: TeacherPaymentRow) => v ?? r.stageCode },
    { title: '金额', dataIndex: 'amount', key: 'amount', width: 120, align: 'right', render: (v: number) => fmtMoney(v) },
    { title: '支付时间', dataIndex: 'paidAt', key: 'paidAt', width: 160, render: (v: string) => fmtDate(v) },
    { title: '备注', dataIndex: 'note', key: 'note', ellipsis: true },
    {
      title: '操作', key: 'action', width: 120, fixed: 'right',
      render: (_v, record) => (
        <Space>
          <Button size="small" onClick={() => { setEditing(record); form.setFieldsValue(record); setDrawerOpen(true); }}>编辑</Button>
          <Button size="small" danger onClick={() => handleDelete(record.id)}>删除</Button>
        </Space>
      ),
    },
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Button type="primary" onClick={() => { setEditing(undefined); form.resetFields(); setDrawerOpen(true); }}>新增老师付款</Button>
      <Table<TeacherPaymentRow> rowKey="id" size="small" columns={columns} dataSource={items} loading={loading} pagination={{ current: page, pageSize, total, onChange: (p) => void load(p) }} scroll={{ x: 900 }} />
      <Modal
        title={editing ? '编辑老师付款' : '新增老师付款'}
        open={drawerOpen}
        onCancel={() => { setDrawerOpen(false); setEditing(undefined); form.resetFields(); }}
        footer={null}
        width={480}
        centered
      >
        <Form layout="vertical" form={form} onFinish={submit}>
          <Form.Item name="orderId" label="订单ID" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="teacherId" label="老师ID" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="stageCode" label="阶段" rules={[{ required: true }]}>
            <Select placeholder="请选择阶段">
              <Select.Option value="draft">初稿 (draft)</Select.Option>
              <Select.Option value="revision">修改 (revision)</Select.Option>
              <Select.Option value="acceptance">验收 (acceptance)</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="stageLabel" label="阶段名称"><Input /></Form.Item>
          <Form.Item name="amount" label="金额" rules={[{ required: true }]}><Input type="number" /></Form.Item>
          <Form.Item name="paidAt" label="支付时间"><Input type="datetime-local" /></Form.Item>
          <Form.Item name="note" label="备注"><Input.TextArea rows={3} /></Form.Item>
          <Button type="primary" htmlType="submit">保存</Button>
        </Form>
      </Modal>
    </Space>
  );
}

// ==================== 其他支出 Tab ====================
function OtherExpenseTab() {
  const { message: messageApi } = App.useApp();
  const [items, setItems] = useState<OtherExpenseRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<OtherExpenseRow | undefined>();
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [form] = Form.useForm();

  async function load(p = page) {
    setLoading(true);
    try {
      const res = await listOtherExpenses({ page: p, pageSize });
      setItems(res.items);
      setTotal(res.total);
      setPage(p);
    } catch (err: any) {
      messageApi.error(err?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(values: any) {
    try {
      if (editing) {
        await updateOtherExpense(editing.id, values);
        messageApi.success('更新成功');
      } else {
        await createOtherExpense(values);
        messageApi.success('创建成功');
      }
      setDrawerOpen(false);
      setEditing(undefined);
      form.resetFields();
      await load();
    } catch (err: any) {
      messageApi.error(err?.message || '操作失败');
    }
  }

  async function handleDelete(id: string) {
    Modal.confirm({
      title: '确认删除？',
      onOk: async () => {
        try {
          await deleteOtherExpense(id);
          messageApi.success('已删除');
          await load();
        } catch (err: any) {
          messageApi.error(err?.message || '删除失败');
        }
      },
    });
  }

  const columns: ColumnsType<OtherExpenseRow> = [
    { title: '分类', dataIndex: 'category', key: 'category', width: 120 },
    { title: '金额', dataIndex: 'amount', key: 'amount', width: 130, align: 'right', render: (v: number) => fmtMoney(v) },
    { title: '发生时间', dataIndex: 'occurredAt', key: 'occurredAt', width: 160, render: (v: string) => fmtDate(v) },
    { title: '关联订单', dataIndex: 'relatedOrderId', key: 'relatedOrderId', width: 180, render: (v: string) => v ?? '-' },
    { title: '备注', dataIndex: 'note', key: 'note', ellipsis: true },
    {
      title: '操作', key: 'action', width: 120, fixed: 'right',
      render: (_v, record) => (
        <Space>
          <Button size="small" onClick={() => { setEditing(record); form.setFieldsValue(record); setDrawerOpen(true); }}>编辑</Button>
          <Button size="small" danger onClick={() => handleDelete(record.id)}>删除</Button>
        </Space>
      ),
    },
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Button type="primary" onClick={() => { setEditing(undefined); form.resetFields(); setDrawerOpen(true); }}>新增支出</Button>
      <Table<OtherExpenseRow> rowKey="id" size="small" columns={columns} dataSource={items} loading={loading} pagination={{ current: page, pageSize, total, onChange: (p) => void load(p) }} scroll={{ x: 900 }} />
      <Modal
        title={editing ? '编辑其他支出' : '新增其他支出'}
        open={drawerOpen}
        onCancel={() => { setDrawerOpen(false); setEditing(undefined); form.resetFields(); }}
        footer={null}
        width={480}
        centered
      >
        <Form layout="vertical" form={form} onFinish={submit}>
          <Form.Item name="category" label="分类" rules={[{ required: true }]}>
            <Select placeholder="请选择分类">
              <Select.Option value="办公用品">办公用品</Select.Option>
              <Select.Option value="房租">房租</Select.Option>
              <Select.Option value="水电费">水电费</Select.Option>
              <Select.Option value="差旅费">差旅费</Select.Option>
              <Select.Option value="餐饮费">餐饮费</Select.Option>
              <Select.Option value="通讯费">通讯费</Select.Option>
              <Select.Option value="营销推广">营销推广</Select.Option>
              <Select.Option value="工资薪金">工资薪金</Select.Option>
              <Select.Option value="其他">其他</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="amount" label="金额" rules={[{ required: true }]}><Input type="number" /></Form.Item>
          <Form.Item name="occurredAt" label="发生时间"><Input type="datetime-local" /></Form.Item>
          <Form.Item name="relatedOrderId" label="关联订单ID"><Input /></Form.Item>
          <Form.Item name="note" label="备注"><Input.TextArea rows={3} /></Form.Item>
          <Button type="primary" htmlType="submit">保存</Button>
        </Form>
      </Modal>
    </Space>
  );
}

// ==================== 主页面 ====================
export default function AdminFinancePage() {
  return (
    <Space direction="vertical" size={16} className="page-stack">
      <div>
        <Title level={2}>财务系统</Title>
        <Paragraph type="secondary">
          订单收入、订单支出（老师付款）、其他支出。仅 owner / admin 可见。
        </Paragraph>
      </div>
      <Card>
        <Tabs
          items={[
            {
              key: 'income',
              label: '订单收入',
              children: <OrderIncomeTab />,
            },
            {
              key: 'expense',
              label: '订单支出',
              children: <TeacherPaymentTab />,
            },
            {
              key: 'other',
              label: '其他支出',
              children: <OtherExpenseTab />,
            },
          ]}
        />
      </Card>
    </Space>
  );
}
