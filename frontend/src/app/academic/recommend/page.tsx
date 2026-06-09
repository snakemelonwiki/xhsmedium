'use client';

import { RecommendPostForm } from '@/shared/components/forms';

export default function AcademicRecommendPage() {
  return (
    <RecommendPostForm
      pageTitle="推荐作品录入"
      pageSubtitle="录入推荐作品的链接和基本信息，提交后自动解析指标。"
      submitLabel="提交推荐作品"
    />
  );
}
