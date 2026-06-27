import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { OrdersService } from './orders.service';

function createRepositoryMock() {
  return {
    findOne: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findAndCount: jest.fn(),
    createQueryBuilder: jest.fn(),
    manager: {
      query: jest.fn(),
    },
  };
}

function createService(overrides: Record<string, any> = {}) {
  const orderRepository = overrides.orderRepository ?? createRepositoryMock();
  const orderFollowRepository = overrides.orderFollowRepository ?? createRepositoryMock();
  const orderFinanceRepository = overrides.orderFinanceRepository ?? createRepositoryMock();
  const orderAuthorRepository = overrides.orderAuthorRepository ?? createRepositoryMock();
  const orderSubmissionRepository = overrides.orderSubmissionRepository ?? createRepositoryMock();
  const userRepository = overrides.userRepository ?? createRepositoryMock();
  const leadRepository = overrides.leadRepository ?? createRepositoryMock();
  const dataSource = overrides.dataSource ?? {
    transaction: jest.fn(async (cb) => cb({
      getRepository: jest.fn(() => createRepositoryMock()),
    })),
    query: jest.fn(),
  };
  const notificationsService = overrides.notificationsService ?? { create: jest.fn() };

  return {
    service: new OrdersService(
      orderRepository,
      orderFollowRepository,
      orderFinanceRepository,
      orderAuthorRepository,
      orderSubmissionRepository,
      userRepository,
      leadRepository,
      dataSource,
      notificationsService,
    ),
    orderRepository,
    orderFollowRepository,
    orderFinanceRepository,
    orderAuthorRepository,
    orderSubmissionRepository,
    userRepository,
    leadRepository,
    dataSource,
    notificationsService,
  };
}

describe('OrdersService', () => {
  it('creates service with required dependencies', () => {
    const { service } = createService();

    expect(service).toBeDefined();
  });

  it('returns delivery fields for institution acceptance and teacher assignment rows', async () => {
    const { service, orderRepository, orderAuthorRepository, orderSubmissionRepository, orderFinanceRepository } =
      createService();
    orderRepository.findOne.mockResolvedValue({
      id: 'order-1',
      orderCode: 'ORD-1',
      institutionAccepted: true,
      orderStatus: 'awaiting_teacher',
      orderStage: 'awaiting_teacher',
      teacherId: 'teacher-1',
      teacherName: '王老师',
      teacherPhone: '13800000000',
      teacherWechat: 'wx-teacher',
      teacherStability: 'stable',
      fundRemark: '基金补充说明',
      backupSubmissionUrl: 'https://cdn.example.com/backup.docx',
      backupSubmissionName: '备用投稿信息表.docx',
      backupTeachers: JSON.stringify([
        {
          teacherId: 'teacher-2',
          teacherName: '李老师',
          teacherPhone: '13900000000',
          teacherStability: 'probation',
        },
      ]),
    });
    orderAuthorRepository.find.mockResolvedValue([]);
    orderSubmissionRepository.find.mockResolvedValue([]);
    orderFinanceRepository.findOne.mockResolvedValue(null);

    const result = await service.getOrderDelivery('order-1', { role: 'admin', userId: 'admin-1' });

    expect(result.order).toMatchObject({
      institutionAccepted: true,
      orderStatus: 'awaiting_teacher',
      statusStage: 'awaiting_teacher',
      assignedTeacher: 'teacher-1',
      assignedTeacherName: '王老师',
      teacherPhone: '13800000000',
      teacherWechat: 'wx-teacher',
      teacherStability: 'stable',
      fundRemark: '基金补充说明',
      backupSubmissionUrl: 'https://cdn.example.com/backup.docx',
      backupSubmissionName: '备用投稿信息表.docx',
      backupTeachers: [
        {
          teacherId: 'teacher-2',
          teacherName: '李老师',
          teacherPhone: '13900000000',
          teacherStability: 'probation',
        },
      ],
    });
  });

  it('saves institution acceptance, backup teacher rows, and academic-controlled order status', async () => {
    const orderRepoInTransaction = createRepositoryMock();
    const dataSource = {
      query: jest.fn(),
      transaction: jest.fn(async (cb) => cb({
        getRepository: jest.fn(() => orderRepoInTransaction),
      })),
    };
    const { service, orderRepository } = createService({ dataSource });
    orderRepository.findOne.mockResolvedValue({ id: 'order-1' });

    await service.saveOrderDelivery(
      'order-1',
      {
        order: {
          institutionAccepted: true,
          statusStage: '待补客户资料',
          orderStatus: 'awaiting_client_info',
          assignedTeacher: 'teacher-1',
          assignedTeacherName: '王老师',
          teacherPhone: '13800000000',
          teacherWechat: 'wx-teacher',
          teacherStability: '优秀',
          fundRemark: '基金补充说明',
          backupSubmissionUrl: 'https://cdn.example.com/backup.docx',
          backupSubmissionName: '备用投稿信息表.docx',
          backupTeachers: [
            {
              teacherId: 'teacher-2',
              teacherName: '李老师',
              teacherPhone: '13900000000',
              teacherStability: '一般',
            },
          ],
        },
      },
      { role: 'academic', userId: 'academic-1' },
    );

    expect(orderRepoInTransaction.update).toHaveBeenCalledWith(
      'order-1',
      expect.objectContaining({
        institutionAccepted: true,
        orderStage: 'awaiting_client_info',
        orderStatus: 'awaiting_client_info',
        teacherId: 'teacher-1',
        teacherName: '王老师',
        teacherPhone: '13800000000',
        teacherWechat: 'wx-teacher',
        teacherStability: '优秀',
        fundRemark: '基金补充说明',
        backupSubmissionUrl: 'https://cdn.example.com/backup.docx',
        backupSubmissionName: '备用投稿信息表.docx',
        backupTeachers: JSON.stringify([
          {
            teacherId: 'teacher-2',
            teacherName: '李老师',
            teacherPhone: '13900000000',
            teacherStability: '一般',
          },
        ]),
      }),
    );
  });

  it('keeps customer payment hidden for academic but preserves teacher payment fields', async () => {
    const { service, orderRepository, orderAuthorRepository, orderSubmissionRepository, orderFinanceRepository } =
      createService();
    orderRepository.findOne.mockResolvedValue({ id: 'order-1' });
    orderAuthorRepository.find.mockResolvedValue([]);
    orderSubmissionRepository.find.mockResolvedValue([]);
    orderFinanceRepository.findOne.mockResolvedValue({
      orderId: 'order-1',
      orderAmount: '5000.00',
      clientPaid: '2000.00',
      clientPending: '3000.00',
      teacherPrice: '1500.00',
      teacherPaid: '500.00',
      teacherPending: '1000.00',
    });

    const result = await service.getOrderDelivery('order-1', { role: 'academic', userId: 'academic-1' });

    expect(result.finance).toMatchObject({
      orderAmount: null,
      customerPaid: null,
      customerPending: null,
      teacherPrice: '1500.00',
      teacherPaid: '500.00',
      teacherPending: '1000.00',
    });
  });

  it('rejects sales delivery update because academic owns delivery fields', async () => {
    const { service, orderRepository } = createService();
    orderRepository.findOne.mockResolvedValue({ id: 'order-1' });

    await expect(
      service.saveOrderDelivery(
        'order-1',
        {
          order: {
            orderStatus: 'awaiting_teacher',
          },
          finance: {
            customerPaid: 300,
          },
        },
        { role: 'sales', userId: 'sales-1' },
      ),
    ).rejects.toThrow(ForbiddenException);

    expect(orderRepository.update).not.toHaveBeenCalled();
  });

  it('reminds the order sales user to collect payment with order context', async () => {
    const { service, orderRepository, notificationsService } = createService();
    orderRepository.findOne.mockResolvedValue({
      id: 'order-1',
      salesUserId: 'sales-1',
      academicUserId: 'academic-1',
      customerName: '张三',
      paymentStage: '尾款',
    });

    const result = await service.remindSalesPayment('order-1', {
      userId: 'academic-1',
      role: 'academic',
    });

    expect(result).toEqual({ ok: true, receiverId: 'sales-1' });
    expect(notificationsService.create).toHaveBeenCalledWith(expect.objectContaining({
      receiverIds: ['sales-1'],
      senderId: 'academic-1',
      portType: 'sales',
      relatedId: 'order-1',
      relatedType: 'order',
      title: '催款提醒',
      content: expect.stringContaining('订单 order-1'),
    }));
    expect(notificationsService.create.mock.calls[0][0].content).toContain('客户 张三');
    expect(notificationsService.create.mock.calls[0][0].content).toContain('付款阶段 尾款');
  });

  it('rejects close deal without deposit payment stage and paid amount', async () => {
    const { service } = createService();

    await expect(
      service.closeDeal('lead-1', 'sales-1', {
        amount: 1000,
        paymentStage: '',
        paidStatus: 'partial',
        clientPaid: 200,
      } as any),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.closeDeal('lead-1', 'sales-1', {
        amount: 1000,
        paymentStage: '已付定金',
        paidStatus: 'partial',
      } as any),
    ).rejects.toThrow(BadRequestException);
  });

  it('creates close deal with lead handover fields and paid amount', async () => {
    const queries: Array<{ sql: string; params?: any[] }> = [];
    const lead = {
      id: 'lead-1',
      contactInfo: 'wx-1',
      nickname: '客户A',
      clientDegree: '本科',
      clientMajorResearch: '计算机',
      ip: '广东',
      intention: '评职称',
      requirementNote: '2个月内见刊',
      postId: null,
      matchedPostId: null,
    };
    const manager = {
      findOne: jest.fn(async (_entity, opts) => (opts.where.id === 'lead-1' ? lead : null)),
      query: jest.fn(async (sql: string, params?: any[]) => {
        queries.push({ sql, params });
        if (sql.includes('SELECT current_seq')) return [{ current_seq: 0 }];
        return [];
      }),
    };
    const dataSource = {
      transaction: jest.fn(async (cb) => cb(manager)),
      query: jest.fn(async () => []),
    };
    const { service } = createService({ dataSource });

    await service.closeDeal('lead-1', 'sales-1', {
      amount: 1000,
      paymentStage: '已付定金',
      paidStatus: 'partial',
      clientPaid: 300,
      productType: '期刊论文',
      serviceType: '全流程',
    } as any);

    const orderInsert = queries.find((q) => q.sql.includes('INSERT INTO orders\n'));
    expect(orderInsert?.sql).toContain('payment_stage');
    expect(orderInsert?.sql).toContain('customer_name');
    expect(orderInsert?.sql).toContain('article_purpose');
    expect(orderInsert?.params).toEqual(expect.arrayContaining(['已付定金', '客户A', '评职称', 'wx-1']));

    const financeInsert = queries.find((q) => q.sql.includes('INSERT INTO order_finance'));
    expect(financeInsert?.params).toEqual(expect.arrayContaining(['300.00', '700.00']));
  });

  it('generates close-deal order code with yl prefix, 190-based sequence, type fields, date, and major', async () => {
    const queries: Array<{ sql: string; params?: any[] }> = [];
    const lead = {
      id: 'lead-1',
      contactInfo: 'wx-1',
      nickname: '客户A',
      clientDegree: '本科',
      clientMajorResearch: '计算机',
      majorContent: '人工智能',
      ip: '广东',
      intention: '评职称',
      postId: null,
      matchedPostId: null,
    };
    const manager = {
      findOne: jest.fn(async (_entity, opts) => (opts.where.id === 'lead-1' ? lead : null)),
      query: jest.fn(async (sql: string, params?: any[]) => {
        queries.push({ sql, params });
        if (sql.includes('SELECT current_seq')) return [{ current_seq: 0 }];
        return [];
      }),
    };
    const dataSource = {
      transaction: jest.fn(async (cb) => cb(manager)),
      query: jest.fn(async () => []),
    };
    const { service } = createService({ dataSource });
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-06-15T02:03:04.000Z'));

    try {
      const result = await service.closeDeal('lead-1', 'sales-1', {
        amount: 1000,
        paymentStage: '已付定金',
        paidStatus: 'partial',
        clientPaid: 300,
        productType: '期刊论文',
        serviceType: '全流程',
      } as any);

      expect(result.orderCode).toBe('YL190期刊论文全流程20260615计算机');

      const orderInsert = queries.find((q) => q.sql.includes('INSERT INTO orders\n'));
      expect(orderInsert?.params).toEqual(expect.arrayContaining(['YL190期刊论文全流程20260615计算机']));
    } finally {
      jest.useRealTimers();
    }
  });

  it('rejects academic accept until deposit stage and paid amount are present', async () => {
    const { service, orderRepository, userRepository, orderFinanceRepository } = createService();
    orderRepository.findOne.mockResolvedValue({
      id: 'order-1',
      salesUserId: 'sales-1',
      academicUserId: 'academic-1',
      handoverStatus: 'handed_over',
      orderStatus: 'to_receive',
      paymentStage: '未付款',
    });
    userRepository.findOne.mockResolvedValue({
      id: 'academic-1',
      role: 'academic',
      employeeId: 'academic-1',
    });
    orderFinanceRepository.findOne.mockResolvedValue({ orderId: 'order-1', clientPaid: null });

    await expect(service.acceptHandover('order-1', 'academic-1')).rejects.toThrow(BadRequestException);

    orderRepository.findOne.mockResolvedValue({
      id: 'order-1',
      salesUserId: 'sales-1',
      academicUserId: 'academic-1',
      handoverStatus: 'handed_over',
      orderStatus: 'to_receive',
      paymentStage: '已付定金',
    });
    orderFinanceRepository.findOne.mockResolvedValue({ orderId: 'order-1', clientPaid: '300.00' });

    await service.acceptHandover('order-1', 'academic-1');

    expect(orderRepository.update).toHaveBeenCalledWith('order-1', {
      handoverStatus: 'accepted',
      orderStatus: 'in_progress',
    });
  });
});
