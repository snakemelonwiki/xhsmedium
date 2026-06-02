'use client';

import { CloudServerOutlined, FolderOpenOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { Alert, Button, Collapse, Modal, Radio, Space, Typography } from 'antd';
import { useEffect, useState } from 'react';

import { useUploadConfig } from '@/shared/contexts/UploadConfigContext';

const { Text } = Typography;

export type UploadTargetChoice = {
  storage: 'local' | 'oss';
};

type Props = {
  open: boolean;
  fileName: string;
  fileSize: number;
  maxFileSize: number;
  onCancel: () => void;
  onConfirm: (choice: UploadTargetChoice) => void;
};

const STORAGE_LABELS: Record<'local' | 'oss', { label: string; description: string }> = {
  local: {
    label: '本地上传',
    description: '保存到本机 uploads/ 目录（局域网内可直接访问，发布外网时需先迁移）',
  },
  oss: {
    label: '阿里云 OSS',
    description: '上传到阿里云对象存储（推荐），访问走 /api/uploads/view 短期签名 URL',
  },
};

export function UploadTargetModal({ open, fileName, fileSize, maxFileSize, onCancel, onConfirm }: Props) {
  const { config } = useUploadConfig();
  const [storage, setStorage] = useState<'local' | 'oss'>(config?.defaultStorage || 'oss');
  const [advancedOpen, setAdvancedOpen] = useState(false);

  useEffect(() => {
    if (open) {
      setStorage(config?.defaultStorage || 'oss');
      setAdvancedOpen(false);
    }
  }, [open, config?.defaultStorage]);

  const tooLarge = fileSize > maxFileSize;
  const defaultLabel = STORAGE_LABELS[config?.defaultStorage || 'oss'].label;
  const selectedLabel = STORAGE_LABELS[storage].label;

  return (
    <Modal
      title="确认上传目标"
      open={open}
      onCancel={onCancel}
      destroyOnClose
      footer={[
        <Button key="cancel" onClick={onCancel}>取消</Button>,
        <Button
          key="ok"
          type="primary"
          disabled={tooLarge}
          onClick={() => onConfirm({ storage })}
        >
          上传到{selectedLabel}
        </Button>,
      ]}
    >
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <div>
          <Text strong>{fileName}</Text>
          <Text type="secondary" style={{ marginLeft: 8 }}>
            {(fileSize / 1024).toFixed(1)} KB
          </Text>
        </div>

        {tooLarge ? (
          <Alert
            type="error"
            showIcon
            message={`文件超过 ${Math.round(maxFileSize / 1024 / 1024)}MB 上限`}
          />
        ) : null}

        <Alert
          type="info"
          showIcon
          icon={<InfoCircleOutlined />}
          message={
            <span>
              当前后端 driver = <Text code>{config?.driver || 'unknown'}</Text>，
              默认将上传到<Text strong>{defaultLabel}</Text>。
            </span>
          }
        />

        <Collapse
          ghost
          activeKey={advancedOpen ? ['adv'] : []}
          onChange={(keys) => setAdvancedOpen(Array.isArray(keys) ? keys.includes('adv') : keys === 'adv')}
          items={[
            {
              key: 'adv',
              label: <Text type="secondary">高级选项（手动选择目标）</Text>,
              children: (
                <Radio.Group
                  value={storage}
                  onChange={(e) => setStorage(e.target.value)}
                  style={{ width: '100%' }}
                >
                  <Space direction="vertical" size={8} style={{ width: '100%' }}>
                    {(['local', 'oss'] as const).map((s) => (
                      <Radio key={s} value={s} style={{ width: '100%' }}>
                        <Space>
                          {s === 'oss' ? <CloudServerOutlined /> : <FolderOpenOutlined />}
                          <Text strong>{STORAGE_LABELS[s].label}</Text>
                        </Space>
                        <div style={{ marginLeft: 24, color: '#999' }}>{STORAGE_LABELS[s].description}</div>
                      </Radio>
                    ))}
                  </Space>
                </Radio.Group>
              ),
            },
          ]}
        />
      </Space>
    </Modal>
  );
}
