'use client';

import { ExportCenterPage } from '@/shared/components/exports/ExportCenterPage';

export default function OperationExportsPage() {
  return (
    <ExportCenterPage
      title="导出中心"
      description="创建并下载当前运营自己范围内的作品、客资、排行榜和协同记录导出。"
      types={['posts', 'leads', 'rankings', 'collaboration_records']}
    />
  );
}
