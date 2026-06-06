'use client';

import { DeleteOutlined, EyeOutlined, UploadOutlined } from '@ant-design/icons';
import { Button, Image, Space, Upload, message } from 'antd';
import type { UploadProps } from 'antd';
import { useState } from 'react';

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
  bucket: string;
  /** 关掉缩略图回调（仅当调用方不需要 coverThumbUrl 时） */
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
  bucket,
  disableThumb = false,
  thumbMaxWidth = 480,
}: ImageUploadFieldProps) {
  const { config } = useUploadConfig();
  const [uploading, setUploading] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const maxFileSize = config?.maxFileSize || 10 * 1024 * 1024;

  function handleBeforeUpload(file: File): boolean {
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
    // 阻止 antd Upload 走默认的 action/customRequest，等 Modal 确认后再走
    return false;
  }

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
      <Upload {...props}>
        <Button icon={<UploadOutlined />} loading={uploading}>
          {value ? '重新上传' : '上传图片'}
        </Button>
      </Upload>

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
