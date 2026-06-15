import { GalleryPageContent } from '@/shared/components/gallery/GalleryPageContent';

export default function AdminGalleryPage() {
  return (
    <GalleryPageContent
      allowFavoriteActions={false}
      showConfigPanel
      description="查看全公司作品广场。这里的展示门槛只影响运营端，主管端始终可查看全部作品。"
    />
  );
}
