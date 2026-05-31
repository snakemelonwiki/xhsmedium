'use client';

import { DeleteOutlined, UploadOutlined } from '@ant-design/icons';
import { Button, Image, Space, Upload, message } from 'antd';
import type { UploadProps } from 'antd';
import { useState } from 'react';

import { uploadFile } from '@/shared/api/uploads';

type ImageUploadFieldProps = {
  value?: string;
  onChange?: (url: string) => void;
  bucket: string;
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

export function ImageUploadField({ value, onChange, bucket }: ImageUploadFieldProps) {
  const [uploading, setUploading] = useState(false);

  const props: UploadProps = {
    maxCount: 1,
    showUploadList: false,
    accept: 'image/*',
    customRequest: async ({ file, onSuccess, onError }) => {
      setUploading(true);
      try {
        const result = await uploadFile(file as File, bucket);
        onChange?.(result.url);
        message.success('图片已上传');
        onSuccess?.(result);
      } catch (err) {
        message.error(err instanceof Error ? err.message : '图片上传失败');
        onError?.(err as Error);
      } finally {
        setUploading(false);
      }
    },
  };

  return (
    <Space direction="vertical" size={8}>
      <Upload {...props}>
        <Button icon={<UploadOutlined />} loading={uploading}>
          {value ? '重新上传' : '上传图片'}
        </Button>
      </Upload>
      {value ? (
        <Space direction="vertical" size={8} align="start">
          <div style={previewFrameStyle}>
            <Image src={value} alt="已上传图片" style={previewImageStyle} />
          </div>
          <Button size="small" danger icon={<DeleteOutlined />} onClick={() => onChange?.('')}>
            删除图片
          </Button>
        </Space>
      ) : null}
    </Space>
  );
}
