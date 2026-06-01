'use client';

import { FilterOutlined, ReloadOutlined } from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  DatePicker,
  Empty,
  Form,
  Input,
  Modal,
  Pagination,
  Select,
  Space,
  Spin,
  Typography,
  message,
} from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { listAdminEmployees } from '@/shared/api/admin';
import { listSalesLeads, updateLeadBoard } from '@/shared/api/leads';
import { LeadCard } from '@/shared/components/leads';
import {
  LeadStatus,
  LeadAddStatus,
  LeadProcessStatus,
} from '@/shared/constants/lead-status-enums';
import type { AdminEmployee } from '@/shared/types/admin';
import type { SalesLead } from '@/shared/types/leads';

const { RangePicker } = DatePicker;

const statusOptions = [
  { label: '全部状态', value: '' },
  { label: '新分配', value: LeadStatus.ASSIGNED },
  { label: '待添加', value: 'pending_add' },
  { label: '未通过', value: LeadAddStatus.NOT_PASSED },
  { label: '已通过', value: LeadAddStatus.ADDED },
  { label: '跟进中', value: LeadStatus.IN_FOLLOWUP },
  { label: '已成交', value: 'deal_done' },
  { label: '无效', value: LeadStatus.INVALID },
];

const addStatusOptions = [
  { label: '全部添加状态', value: '' },
  { label: '未添加', value: LeadAddStatus.NOT_ADDED },
  { label: '已申请添加', value: LeadAddStatus.APPLIED },
  { label: '待通过', value: 'waiting_pass' },
  { label: '客户未通过', value: LeadAddStatus.NOT_PASSED },
  { label: '运营已提醒', value: LeadAddStatus.OPERATION_REMINDED },
  { label: '已添加通过', value: LeadAddStatus.ADDED },
];

const platformOptions = [
  { label: '全部平台', value: '' },
  { label: '小红书', value: 'xiaohongshu' },
  { label: '抖音', value: 'douyin' },
  { label: '其他', value: 'other' },
];

const intentionLevelOptions = [
  { label: '全部意向度', value: '' },
  { label: '1 - 很低', value: 1 },
  { label: '2 - 较低', value: 2 },
  { label: '3 - 一般', value: 3 },
  { label: '4 - 较高', value: 4 },
  { label: '5 - 很高', value: 5 },
];

type Filters = {
  status: string;
  addStatus: string;
  platform: string;
  sourceAccount: string;
  operatorId: string;
  intentionLevel: string;
  startDate: string;
  endDate: string;
  nextFollowStart: string;
  nextFollowEnd: string;
};

const EMPTY_FILTERS: Filters = {
  status: '',
  addStatus: '',
  platform: '',
  sourceAccount: '',
  operatorId: '',
  intentionLevel: '',
  startDate: '',
  endDate: '',
  nextFollowStart: '',
  nextFollowEnd: '',
};

type AdvancedFormValues = {
  platform?: string;
  sourceAccount?: string;
  operatorId?: string;
  intentionLevel?: string;
  dateRange?: (Dayjs | null)[] | null;
  nextFollowRange?: (Dayjs | null)[] | null;
};

function formatDayjs(value: Dayjs | null | undefined): string {
  if (!value) return '';
  return value.format('YYYY-MM-DD');
}

export default function SalesLeadsPage() {
  const router = useRouter();
  const [items, setItems] = useState<SalesLead[]>([]);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [employees, setEmployees] = useState<AdminEmployee[]>([]);
  const [employeesLoading, setEmployeesLoading] = useState(false);

  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [advancedForm] = Form.useForm();

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [batchLoading, setBatchLoading] = useState(false);

  async function loadEmployees() {
    setEmployeesLoading(true);
    try {
      const result = await listAdminEmployees({ page: 1, pageSize: 200, limit: 200 });
      setEmployees(result.items);
    } catch (err) {
      // 拉取员工列表失败不阻塞主流程
      // eslint-disable-next-line no-console
      console.warn('[sales-leads] load employees failed', err);
    } finally {
      setEmployeesLoading(false);
    }
  }

  async function loadLeads(
    nextPage = page,
    nextPageSize = pageSize,
    nextFilters: Filters = filters,
  ) {
    setLoading(true);
    setError('');
    try {
      const result = await listSalesLeads({
        page: nextPage,
        pageSize: nextPageSize,
        ...buildListQuery(nextFilters),
      });
      setItems(result.items);
      setTotal(result.total);
      setPage(result.page);
      setPageSize(result.pageSize);
      // 切换条件后清掉选中的行
      setSelectedIds([]);
    } catch (err) {
      const text = err instanceof Error ? err.message : '客资列表加载失败';
      setError(text);
      message.error(text);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadEmployees();
  }, []);

  useEffect(() => {
    loadLeads(1, pageSize, filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    filters.status,
    filters.addStatus,
    filters.platform,
    filters.sourceAccount,
    filters.operatorId,
    filters.intentionLevel,
    filters.startDate,
    filters.endDate,
    filters.nextFollowStart,
    filters.nextFollowEnd,
  ]);

  const employeeOptions = useMemo(
    () => [
      { label: '全部运营', value: '' },
      ...employees.map((emp) => ({ label: emp.name, value: emp.id })),
    ],
    [employees],
  );

  const selectedLeads = useMemo(
    () => items.filter((lead) => selectedIds.includes(String(lead.id))),
    [items, selectedIds],
  );

  function openAdvanced() {
    const values: AdvancedFormValues = {
      platform: filters.platform || undefined,
      sourceAccount: filters.sourceAccount || undefined,
      operatorId: filters.operatorId || undefined,
      intentionLevel: filters.intentionLevel || undefined,
      dateRange:
        filters.startDate && filters.endDate
          ? [dayjs(filters.startDate), dayjs(filters.endDate)]
          : null,
      nextFollowRange:
        filters.nextFollowStart && filters.nextFollowEnd
          ? [dayjs(filters.nextFollowStart), dayjs(filters.nextFollowEnd)]
          : null,
    };
    advancedForm.setFieldsValue(values);
    setAdvancedOpen(true);
  }

  function applyAdvanced() {
    const values = advancedForm.getFieldsValue() as AdvancedFormValues;
    setFilters((prev) => ({
      ...prev,
      platform: values.platform ?? '',
      sourceAccount: values.sourceAccount?.trim() ?? '',
      operatorId: values.operatorId ?? '',
      intentionLevel: values.intentionLevel ? String(values.intentionLevel) : '',
      startDate: values.dateRange?.[0] ? formatDayjs(values.dateRange[0]) : '',
      endDate: values.dateRange?.[1] ? formatDayjs(values.dateRange[1]) : '',
      nextFollowStart: values.nextFollowRange?.[0] ? formatDayjs(values.nextFollowRange[0]) : '',
      nextFollowEnd: values.nextFollowRange?.[1] ? formatDayjs(values.nextFollowRange[1]) : '',
    }));
    setAdvancedOpen(false);
  }

  function resetAdvanced() {
    advancedForm.resetFields();
    setFilters((prev) => ({
      ...prev,
      platform: '',
      sourceAccount: '',
      operatorId: '',
      intentionLevel: '',
      startDate: '',
      endDate: '',
      nextFollowStart: '',
      nextFollowEnd: '',
    }));
    setAdvancedOpen(false);
  }

  function toggleSelectAll(checked: boolean) {
    if (checked) {
      setSelectedIds(items.map((lead) => String(lead.id)));
    } else {
      setSelectedIds([]);
    }
  }

  function toggleSelectOne(id: string | number, checked: boolean) {
    const key = String(id);
    setSelectedIds((prev) => {
      if (checked) return prev.includes(key) ? prev : [...prev, key];
      return prev.filter((item) => item !== key);
    });
  }

  async function batchMarkRead() {
    if (selectedLeads.length === 0) {
      message.warning('请先选择客资');
      return;
    }
    setBatchLoading(true);
    let success = 0;
    let failed = 0;
    await Promise.all(
      selectedLeads.map(async (lead) => {
        try {
          await updateLeadBoard(String(lead.id), { isRead: true });
          success += 1;
        } catch {
          failed += 1;
        }
      }),
    );
    setBatchLoading(false);
    if (success > 0) {
      message.success(`已标记 ${success} 条客资为已读${failed ? `，${failed} 条失败` : ''}`);
      loadLeads(page, pageSize, filters);
    } else {
      message.error('批量标记已读失败');
    }
  }

  async function batchMarkCommunicating() {
    if (selectedLeads.length === 0) {
      message.warning('请先选择客资');
      return;
    }
    setBatchLoading(true);
    let success = 0;
    let failed = 0;
    await Promise.all(
      selectedLeads.map(async (lead) => {
        try {
          await updateLeadBoard(String(lead.id), {
            processStatus: LeadProcessStatus.COMMUNICATING,
          });
          success += 1;
        } catch {
          failed += 1;
        }
      }),
    );
    setBatchLoading(false);
    if (success > 0) {
      message.success(
        `已将 ${success} 条客资标记为沟通中${failed ? `，${failed} 条失败` : ''}`,
      );
      loadLeads(page, pageSize, filters);
    } else {
      message.error('批量进入待跟进失败');
    }
  }

  function clearSelection() {
    setSelectedIds([]);
  }

  const advancedActiveCount = [
    filters.platform,
    filters.sourceAccount,
    filters.operatorId,
    filters.intentionLevel,
    filters.startDate,
    filters.endDate,
    filters.nextFollowStart,
    filters.nextFollowEnd,
  ].filter(Boolean).length;

  return (
    <Space direction="vertical" size={16} className="page-stack">
      <div className="toolbar-row">
        <div>
          <Typography.Title level={2}>我的客资</Typography.Title>
          <Typography.Paragraph type="secondary">查看分配给当前销售的客资，并进入详情继续跟进。</Typography.Paragraph>
        </div>
        <Space wrap>
          <Select
            value={filters.status}
            options={statusOptions}
            onChange={(value) => setFilters((prev) => ({ ...prev, status: value }))}
            style={{ width: 160 }}
          />
          <Select
            value={filters.addStatus}
            options={addStatusOptions}
            onChange={(value) => setFilters((prev) => ({ ...prev, addStatus: value }))}
            style={{ width: 180 }}
          />
          <Button icon={<FilterOutlined />} onClick={openAdvanced}>
            高级筛选{advancedActiveCount > 0 ? ` (${advancedActiveCount})` : ''}
          </Button>
          <Button icon={<ReloadOutlined />} onClick={() => loadLeads()} loading={loading}>
            刷新
          </Button>
        </Space>
      </div>

      {error ? <Alert type="warning" showIcon message={error} /> : null}

      <Spin spinning={loading}>
        <Card>
          {selectedLeads.length > 0 ? (
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: 12,
                padding: '8px 12px',
                marginBottom: 12,
                background: '#f0f5ff',
                border: '1px solid #adc6ff',
                borderRadius: 6,
              }}
            >
              <Typography.Text>已选 {selectedLeads.length} 条</Typography.Text>
              <Button
                type="primary"
                ghost
                size="small"
                loading={batchLoading}
                onClick={batchMarkRead}
              >
                批量标记已读
              </Button>
              <Button
                type="primary"
                size="small"
                loading={batchLoading}
                onClick={batchMarkCommunicating}
              >
                批量进入待跟进
              </Button>
              <Button size="small" type="link" onClick={clearSelection}>
                清空选择
              </Button>
            </div>
          ) : null}

          {items.length ? (
            <>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '4px 0 12px',
                  borderBottom: '1px dashed #f0f0f0',
                  marginBottom: 12,
                }}
              >
                <Checkbox
                  indeterminate={
                    selectedIds.length > 0 && selectedIds.length < items.length
                  }
                  checked={items.length > 0 && selectedIds.length === items.length}
                  onChange={(e) => toggleSelectAll(e.target.checked)}
                >
                  全选当前页
                </Checkbox>
              </div>
              {items.map((lead) => {
                const leadId = String(lead.id);
                const checked = selectedIds.includes(leadId);
                return (
                  <div
                    key={leadId}
                    style={{
                      position: 'relative',
                      paddingLeft: 32,
                      marginBottom: 12,
                    }}
                  >
                    <div style={{ position: 'absolute', left: 0, top: 12 }}>
                      <Checkbox
                        checked={checked}
                        onChange={(e) => toggleSelectOne(lead.id, e.target.checked)}
                      />
                    </div>
                    <LeadCard
                      lead={lead}
                      onOpen={(item) => router.push(`/sales/leads/${item.id}`)}
                      onCollaborate={(item) => router.push(`/sales/collaboration?leadId=${item.id}`)}
                    />
                  </div>
                );
              })}
            </>
          ) : (
            <Empty description="暂无客资" />
          )}
          <Pagination
            current={page}
            pageSize={pageSize}
            total={total}
            showSizeChanger
            onChange={(nextPage, nextPageSize) => loadLeads(nextPage, nextPageSize, filters)}
            style={{ marginTop: 16, textAlign: 'right' }}
          />
        </Card>
      </Spin>

      <Modal
        title="高级筛选"
        open={advancedOpen}
        onCancel={() => setAdvancedOpen(false)}
        width={640}
        destroyOnClose
        footer={[
          <Button key="reset" onClick={resetAdvanced}>
            清空
          </Button>,
          <Button key="cancel" onClick={() => setAdvancedOpen(false)}>
            取消
          </Button>,
          <Button key="apply" type="primary" onClick={applyAdvanced}>
            应用
          </Button>,
        ]}
      >
        <Form form={advancedForm} layout="vertical" preserve={false}>
          <Form.Item label="平台" name="platform">
            <Select options={platformOptions} placeholder="全部平台" allowClear />
          </Form.Item>
          <Form.Item label="来源账号" name="sourceAccount">
            <Input placeholder="按来源账号名模糊匹配" allowClear />
          </Form.Item>
          <Form.Item label="运营" name="operatorId">
            <Select
              options={employeeOptions}
              loading={employeesLoading}
              placeholder="全部运营"
              allowClear
              showSearch
              optionFilterProp="label"
            />
          </Form.Item>
          <Form.Item label="意向度" name="intentionLevel">
            <Select options={intentionLevelOptions} placeholder="全部意向度" allowClear />
          </Form.Item>
          <Form.Item label="分配时间范围" name="dateRange">
            <RangePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="下次跟进时间范围" name="nextFollowRange">
            <RangePicker style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}

function buildListQuery(filters: Filters) {
  const statusQuery = toStatusQuery(filters.status);
  return {
    ...statusQuery,
    addStatus: filters.addStatus || statusQuery.addStatus || undefined,
    platform: filters.platform || undefined,
    sourceAccount: filters.sourceAccount || undefined,
    operatorId: filters.operatorId || undefined,
    intentionLevel: filters.intentionLevel || undefined,
    startDate: filters.startDate || undefined,
    endDate: filters.endDate || undefined,
    nextFollowStart: filters.nextFollowStart || undefined,
    nextFollowEnd: filters.nextFollowEnd || undefined,
  };
}

function toStatusQuery(value: string) {
  if (value === 'pending_add') return { addStatus: LeadAddStatus.NOT_ADDED };
  if (value === LeadAddStatus.NOT_PASSED) return { addStatus: LeadAddStatus.NOT_PASSED };
  if (value === LeadAddStatus.ADDED) return { addStatus: LeadAddStatus.ADDED };
  if (value === 'deal_done') {
    return { processStatus: LeadProcessStatus.DEAL_DONE };
  }
  if (value === LeadStatus.INVALID) {
    return { status: LeadStatus.INVALID, processStatus: LeadProcessStatus.INVALID };
  }
  return { status: value || undefined };
}
