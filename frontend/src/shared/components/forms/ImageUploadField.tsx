'use client';

import { DeleteOutlined, UploadOutlined } from '@ant-design/icons';
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
  /** 缩略图 URL（提交时一并落库） */
  thumbUrl?: string;
  onChange?: (url: string) => void;
  onThumbChange?: (url: string) => void;
  bucket: string;
  /** 关掉缩略图（仅当调用方不需要 coverThumbUrl 时） */
  disableThumb?: boolean;
  /** 缩略图目标宽 */
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
} as const;

const previewImageStyle = {
  maxWidth: 164,
  maxHeight: 240,
  objectFit: 'contain',
} as const;

const thumbPreviewStyle = {
  width: 120,
  minHeight: 80,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 4,
  border: '1px dashed #d9d9d9',
  borderRadius: 6,
  background: '#fafafa',
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
      const main: UploadResult = await uploadFile(file, bucket, { storage: choice.storage });
      onChange?.(main.url);

      if (!disableThumb) {
        try {
          const blob = await makeThumbnail(file, { maxWidth: thumbMaxWidth, quality: 0.8 });
          const thumb = await uploadFile(blob, bucket, {
            storage: choice.storage,
            keyPrefix: 'thumb_',
          });
          onThumbChange?.(thumb.url);
        } catch (err) {
          // 缩略图失败不阻塞主图；告警但允许提交
          message.warning(`缩略图生成失败：${err instanceof Error ? err.message : '未知错误'}`);
          onThumbChange?.('');
        }
      }

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
            <div style={previewFrameStyle}>
              <Image src={value} alt="已上传图片" style={previewImageStyle} />
            </div>
            <div style={{ fontSize: 12, color: '#999' }}>原图</div>
          </Space>
          {!disableThumb && thumbUrl ? (
            <Space direction="vertical" size={8} align="start">
              <div style={thumbPreviewStyle}>
                <Image src={thumbUrl} alt="缩略图" style={{ maxWidth: 112, maxHeight: 72, objectFit: 'cover' }} />
              </div>
              <div style={{ fontSize: 12, color: '#999' }}>缩略图（{thumbMaxWidth}px）</div>
            </Space>
          ) : null}
          <Button size="small" danger icon={<DeleteOutlined />} onClick={() => {
            onChange?.('');
            if (!disableThumb) onThumbChange?.('');
          }}>
            删除
          </Button>
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
