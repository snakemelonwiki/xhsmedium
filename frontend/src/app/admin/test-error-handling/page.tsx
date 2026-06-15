'use client';

import { useState } from 'react';
import { Button, Space, Card, message } from 'antd';

export default function TestErrorHandlingPage() {
  const [loading, setLoading] = useState(false);

  const testApiError = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/test-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await response.json();
      console.log('Response:', response.status, data);

      if (!response.ok) {
        throw new Error(data.message || '请求失败');
      }

      message.success('请求成功');
    } catch (err: unknown) {
      console.log('Error caught:', (err as Error).message);
      const msg = (err as { message?: string })?.message || '请求失败';
      message.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const testUsersStaff = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/users/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'admin_d',
          password: 'test123',
          employeeId: 'test-employee-id',
          status: 'active'
        }),
      });

      const data = await response.json();
      console.log('Response:', response.status, data);

      if (!response.ok) {
        throw new Error(data.message || '请求失败');
      }

      message.success('创建成功');
    } catch (err: unknown) {
      console.log('Error caught:', (err as Error).message);
      const msg = (err as { message?: string })?.message || '请求失败';
      message.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: 24 }}>
      <Card title="API错误处理测试">
        <Space direction="vertical" size="middle">
          <Button type="primary" onClick={testApiError} loading={loading}>
            测试模拟错误接口
          </Button>

          <Button type="primary" onClick={testUsersStaff} loading={loading}>
            测试 /api/users/staff 接口
          </Button>

          <div style={{ color: '#666', fontSize: 12 }}>
            <p>点击按钮后，如果API返回错误，应该在页面顶部显示错误提示消息。</p>
            <p>请同时打开浏览器控制台查看日志输出。</p>
          </div>
        </Space>
      </Card>
    </div>
  );
}
