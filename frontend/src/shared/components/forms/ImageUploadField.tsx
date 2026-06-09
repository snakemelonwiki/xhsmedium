'use client';

import { DeleteOutlined, EyeOutlined, UploadOutlined } from '@ant-design/icons';
import { Button, Image, Space, Upload, message } from 'antd';
import type { UploadProps } from 'antd';
import { useCallback, useState } from 'react';

import { uploadFile, type UploadResult } from '@/shared/api/uploads';
import { useUploadConfig } from '@/shared/contexts/UploadConfigContext';
import { makeThumbnail } from '@/shared/utils/thumbnail';
import { UploadTargetModal, type UploadTargetChoice } from './UploadTargetModal';

type ImageUploadFieldProps = {
  /** 主图 URL（Form.Item 绑定的 value） */
  value?: string;
  /** 缩略图 URL（提交时一并落库；与 value 同一份低分辨率图） */
  thumbUrl?: string;
  onChange?: (url: string) => void;
  onThumbChange?: (url: string) => void;
  /**
   * 粘贴图片到上传区时触发（T10.1 / T10.2 衔接点）。
   * 父组件可在这里调 OCR / 自动填表；File 已经被组件自身接管（走 beforeUpload → Modal → 上传）。
   * 注意：当前实现是同步走上传流程，外部无需重复处理 file。
   */
  onPastedImage?: (file: File) => void;
  bucket: string;
  /**
   * 关掉缩略图回调（仅当调用方不需要 coverThumbUrl 时） */
  disableThumb?: boolean;
  /** 缩略图目标宽（原图直接复用同一份低分辨率图，所以此值即最终图宽） */
  thumbMaxWidth?: number;
};

const previewFrameStyle = {
  width: 180,
  minHeight: 180,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 8,
  border: '1px solid #e5e8ef',
  borderRadius: 8,
  background: '#ffffff',
  cursor: 'pointer',
} as const;

const previewImageStyle = {
  maxWidth: 164,
  maxHeight: 240,
  objectFit: 'contain',
} as const;

export function ImageUploadField({
  value,
  thumbUrl,
  onChange,
  onThumbChange,
  onPastedImage,
  bucket,
  disableThumb = false,
  thumbMaxWidth = 480,
}: ImageUploadFieldProps) {
  const { config } = useUploadConfig();
  const [uploading, setUploading] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const maxFileSize = config?.maxFileSize || 10 * 1024 * 1024;

  /**
   * 共用校验：返回 true 表示已"接管"该文件（已挂到 pendingFile + 打开 Modal）；
   * 返回 false 表示文件非法，已 message 提示。点击上传和 Ctrl+V 粘贴都走这一份校验，
   * 避免双份逻辑。
   */
  function acceptFile(file: File): boolean {
    if (file.size > maxFileSize) {
      message.error(`文件超过 ${Math.round(maxFileSize / 1024 / 1024)}MB 上限`);
      return false;
    }
    if (!file.type.startsWith('image/')) {
      message.error('请上传图片文件');
      return false;
    }
    setPendingFile(file);
    setModalOpen(true);
    return true;
  }

  function handleBeforeUpload(file: File): boolean {
    const accepted = acceptFile(file);
    // antd Upload 约定：返回 false 阻止走默认的 action/customRequest
    return accepted ? false : false;
  }

  /**
   * T10.1 修复：在上传区监听 paste，提取 clipboardData 里的 image/*，复用 acceptFile。
   * - 没有 image 项时直接 return，不 preventDefault，让文本粘贴继续走默认行为。
   * - 焦点不在此 wrapper 时，浏览器不会把 paste 事件派发到这里，不会劫持全局粘贴。
   * - 通知父级 onPastedImage：让父级可以并行触发 OCR（T10.2），与上传互不阻塞。
   */
  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLDivElement>) => {
      const items = e.clipboardData?.items;
      if (!items || items.length === 0) return;
      let imageItem: DataTransferItem | null = null;
      for (let i = 0; i < items.length; i += 1) {
        const it = items[i];
        if (it.kind === 'file' && it.type.startsWith('image/')) {
          imageItem = it;
          break;
        }
      }
      if (!imageItem) return; // 没有图片，不阻止默认行为（文本粘贴不受影响）
      e.preventDefault();
      const file = imageItem.getAsFile();
      if (!file) return;
      const accepted = acceptFile(file);
      if (!accepted) return;
      // 通知父级：图片已落定；可并行触发 OCR（T10.2）
      onPastedImage?.(file);
    },
    [onPastedImage, maxFileSize], // maxFileSize 影响 acceptFile 行为，必须列入依赖
  );

  async function doUpload(file: File, choice: UploadTargetChoice) {
    setUploading(true);
    try {
      // v1.3 简化：客户端直接压缩到 thumbMaxWidth，仅上传一份低分辨率图。
      // coverImageUrl 和 coverThumbUrl 共用同一份 URL。
      const blob = await makeThumbnail(file, { maxWidth: thumbMaxWidth, quality: 0.8 });
      const result: UploadResult = await uploadFile(blob, bucket, { storage: choice.storage });
      onChange?.(result.url);
      if (!disableThumb) onThumbChange?.(result.url);

      message.success(
        choice.storage === 'oss' ? '图片已上传到阿里云 OSS' : '图片已上传到本机',
      );
    } catch (err) {
      message.error(err instanceof Error ? err.message : '图片上传失败');
      throw err;
    } finally {
      setUploading(false);
    }
  }

  const props: UploadProps = {
    maxCount: 1,
    showUploadList: false,
    accept: 'image/*',
    beforeUpload: handleBeforeUpload,
  };

  return (
    <Space direction="vertical" size={8}>
      {/*
        T10.1 修复：用一层带 onPaste 的 wrapper 覆盖整个上传卡片区域。
        用户在卡片内任意位置按 Ctrl+V（焦点不必在按钮上），都会走 handlePaste 提取
        clipboardData.items 里的 image/*，并复用与点击"上传图片"按钮完全一致的
        handleBeforeUpload 流程（大小 / MIME / 目标存储 → Modal → 缩略图 → /uploads）。
        焦点不在此卡片时，浏览器 paste 事件不会冒泡到这里，因此不会劫持全局粘贴。
      */}
      <div
        onPaste={handlePaste}
        tabIndex={0}
        role="region"
        aria-label="图片上传区（可粘贴图片）"
        style={{ display: 'inline-block', outline: 'none' }}
      >
        <Upload {...props}>
          <Button icon={<UploadOutlined />} loading={uploading}>
            {value ? '重新上传' : '上传图片'}
          </Button>
        </Upload>
      </div>

      {value ? (
        <Space size={12} align="start">
          <Space direction="vertical" size={8} align="start">
            {/*
              antd <Image> 默认 preview=true：点击缩略图即弹出大图预览。
              显式包一层 .ant-image + 提供 a11y role，确保链接解析后 setFieldsValue
              触发的 value 变更也能立即看到可点击的预览（避免 ImageUploadField 因
              受控 value 切换时机导致 antd 注册的 preview handler 没及时挂上）。
            */}
            <div
              style={previewFrameStyle}
              role="button"
              tabIndex={0}
              aria-label="点击查看封面大图"
            >
              <Image
                src={value}
                alt="已上传图片"
                style={previewImageStyle}
                preview={{ mask: '点击查看大图' }}
              />
            </div>
            <div style={{ fontSize: 12, color: '#999' }}>封面（{thumbMaxWidth}px）</div>
          </Space>
          <Space direction="vertical" size={6}>
            <Button
              size="small"
              type="link"
              icon={<EyeOutlined />}
              onClick={() => {
                // 显式兜底：万一 antd Image 内部 preview 没触发，提供一个独立入口
                // 让用户从新窗口打开原图（兜底 URL 来自当前 value）
                window.open(value, '_blank', 'noopener,noreferrer');
              }}
            >
              查看大图
            </Button>
            <Button size="small" danger icon={<DeleteOutlined />} onClick={() => {
              onChange?.('');
              if (!disableThumb) onThumbChange?.('');
            }}>
              删除
            </Button>
          </Space>
        </Space>
      ) : null}

      <UploadTargetModal
        open={modalOpen}
        fileName={pendingFile?.name || ''}
        fileSize={pendingFile?.size || 0}
        maxFileSize={maxFileSize}
        onCancel={() => {
          setModalOpen(false);
          setPendingFile(null);
        }}
        onConfirm={async (choice) => {
          const f = pendingFile;
          setModalOpen(false);
          setPendingFile(null);
          if (f) await doUpload(f, choice);
        }}
      />
    </Space>
  );
}
