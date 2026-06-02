'use client';

import { ExportCenterPage } from '@/shared/components/exports/ExportCenterPage';

export default function AdminExportsPage() {
  return (
    <ExportCenterPage
      title="导出中心"
      description="创建并下载主管可见范围内的作品、客资、排行榜、订单、协同记录和账号导出。"
      types={['posts', 'leads', 'rankings', 'orders', 'collaboration_records', 'accounts']}
    />
  );
}
