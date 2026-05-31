'use client';

import {
  BellOutlined,
  ExclamationCircleOutlined,
  OrderedListOutlined,
  RightOutlined,
} from '@ant-design/icons';
import { Card, Col, Row, Space, Statistic, Typography } from 'antd';
import Link from 'next/link';

const navCards = [
  {
    title: '订单池',
    description: '查看待领取与进行中的履约订单。',
    href: '/academic/orders',
    icon: <OrderedListOutlined />,
  },
  {
    title: '异常订单',
    description: '集中处理异常状态订单并推进回正常流程。',
    href: '/academic/abnormal',
    icon: <ExclamationCircleOutlined />,
  },
  {
    title: '消息',
    description: '查看成交通知、异常提醒与履约协作消息。',
    href: '/academic/messages',
    icon: <BellOutlined />,
  },
];

export default function AcademicHomePage() {
  return (
    <Space direction="vertical" size={16} className="page-stack">
      <div>
        <Typography.Title level={2}>教务首页</Typography.Title>
        <Typography.Paragraph type="secondary">从订单池接单，优先处理异常，并同步查看订单消息。</Typography.Paragraph>
      </div>

      <Row gutter={[16, 16]}>
        {navCards.map((card) => (
          <Col xs={24} md={8} key={card.href}>
            <Link href={card.href}>
              <Card hoverable>
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  <Space style={{ justifyContent: 'space-between', width: '100%' }}>
                    <Typography.Title level={4} style={{ margin: 0 }}>
                      <Space>
                        {card.icon}
                        {card.title}
                      </Space>
                    </Typography.Title>
                    <RightOutlined />
                  </Space>
                  <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
                    {card.description}
                  </Typography.Paragraph>
                </Space>
              </Card>
            </Link>
          </Col>
        ))}
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} md={8}>
          <Card>
            <Statistic title="待领取入口" value="订单池" />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card>
            <Statistic title="异常处理入口" value="异常订单" />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card>
            <Statistic title="通知入口" value="消息" />
          </Card>
        </Col>
      </Row>
    </Space>
  );
}
