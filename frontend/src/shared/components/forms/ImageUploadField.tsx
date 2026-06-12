'use client';

import { DeleteOutlined, EyeOutlined, UploadOutlined } from '@ant-design/icons';
import { Button, Image, Space, Upload, message } from 'antd';
import type { UploadProps } from 'antd';
import { useCallback, useEffect, useRef, useState } from 'react';

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
  /**
   * 拖拽图片到上传区时触发。
   */
  onDroppedImage?: (file: File) => void;
  /**
   * 是否需要弹窗确认上传目标。
   * 默认 false：直接上传到本地，不再弹窗。
   */
  confirmTarget?: boolean;
  /**
   * 是否在 document 级别监听 paste，使焦点不在上传区时也能 Ctrl+V 粘贴图片。
   * 默认 false：仅在组件 wrapper 上监听 paste（需要组件先获得焦点）。
   */
  listenGlobalPaste?: boolean;
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
  onDroppedImage,
  confirmTarget = false,
  listenGlobalPaste = false,
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
   * 上传文件到服务器。
   */
  const doUpload = useCallback(
    async (
      file: File,
      choice: UploadTargetChoice,
      options?: { successMessage?: string },
    ) => {
      setUploading(true);
      try {
        // v1.3 简化：客户端直接压缩到 thumbMaxWidth，仅上传一份低分辨率图。
        // coverImageUrl 和 coverThumbUrl 共用同一份 URL。
        const blob = await makeThumbnail(file, { maxWidth: thumbMaxWidth, quality: 0.8 });
        const result: UploadResult = await uploadFile(blob, bucket, { storage: choice.storage });
        onChange?.(result.url);
        if (!disableThumb) onThumbChange?.(result.url);

        message.success(options?.successMessage ?? '图片已上传');
      } catch (err) {
        message.error(err instanceof Error ? err.message : '图片上传失败');
        throw err;
      } finally {
        setUploading(false);
      }
    },
    [bucket, disableThumb, onChange, onThumbChange, thumbMaxWidth],
  );

  /**
   * 共用文件处理：校验通过后，confirmTarget=true 打开 Modal 选择上传目标；
   * confirmTarget=false 直接上传到本地，不再弹窗。
   */
  const processFile = useCallback(
    async (file: File, options?: { successMessage?: string }): Promise<boolean> => {
      if (file.size > maxFileSize) {
        message.error(
          `图片 ${(file.size / 1024 / 1024).toFixed(2)}MB，超过 ${Math.round(
            maxFileSize / 1024 / 1024,
          )}MB 上限，请压缩后重新粘贴`,
        );
        return false;
      }
      if (!file.type.startsWith('image/')) {
        message.error('请上传图片文件');
        return false;
      }
      if (confirmTarget) {
        setPendingFile(file);
        setModalOpen(true);
      } else {
        await doUpload(file, { storage: 'local' }, { successMessage: options?.successMessage });
      }
      return true;
    },
    [maxFileSize, confirmTarget, doUpload],
  );

  function handleBeforeUpload(file: File): boolean {
    // antd Upload 约定：返回 false 阻止走默认的 action/customRequest
    processFile(file).catch(() => {});
    return false;
  }

  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);

  /**
   * T10.1 修复：在上传区监听 paste，提取 clipboardData 里的 image/*，复用 processFile。
   * - 没有 image 项时直接 return，不 preventDefault，让文本粘贴继续走默认行为。
   * - 焦点不在此 wrapper 时，浏览器不会把 paste 事件派发到这里；全局粘贴由 listenGlobalPaste 补充。
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
      if (!file) {
        message.error('无法读取剪贴板图片，请尝试截图后重新粘贴');
        return;
      }
      processFile(file, { successMessage: '粘贴图片成功' })
        .then((accepted) => {
          if (!accepted) return;
          // 通知父级：图片已落定；可并行触发 OCR（T10.2）
          onPastedImage?.(file);
        })
        .catch(() => {});
    },
    [processFile, onPastedImage],
  );

  /**
   * 拖拽上传：在上传区监听 dragenter/dragover/dragleave/drop。
   * 用 dragCounterRef 解决子元素反复触发 dragenter/dragleave 导致的高亮闪烁。
   */
  const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current += 1;
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current = 0;
      setIsDragging(false);

      const files = e.dataTransfer.files;
      if (!files || files.length === 0) return;

      const file = files[0];
      if (!file.type.startsWith('image/')) {
        message.error('请上传图片文件');
        return;
      }

      processFile(file)
        .then((accepted) => {
          if (!accepted) return;
          onDroppedImage?.(file);
        })
        .catch(() => {});
    },
    [processFile, onDroppedImage],
  );

  /**
   * 全局 paste 监听：当 listenGlobalPaste=true 时，在整个 document 上捕获粘贴事件。
   * - 仅当剪贴板里包含图片文件时才处理；没有图片时直接 return，不阻止默认行为。
   * - 焦点在 input/textarea/contenteditable 且同时存在 text/plain 时，优先保留文本粘贴，
   *   避免劫持链接、备注等文本输入。
   * - 处理流程与局部粘贴一致：校验 → 上传 → 通知父级 onPastedImage。
   */
  const handleGlobalPaste = useCallback(
    (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items || items.length === 0) return;

      let imageItem: DataTransferItem | null = null;
      let hasPlainText = false;
      for (let i = 0; i < items.length; i += 1) {
        const it = items[i];
        if (it.kind === 'file' && it.type.startsWith('image/')) {
          imageItem = it;
        } else if (it.kind === 'string' && it.type === 'text/plain') {
          hasPlainText = true;
        }
      }
      if (!imageItem) return;

      const active = document.activeElement;
      const isTyping =
        active instanceof HTMLElement &&
        (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable);
      if (isTyping && hasPlainText) return;

      e.preventDefault();
      const file = imageItem.getAsFile();
      if (!file) {
        message.error('无法读取剪贴板图片，请尝试截图后重新粘贴');
        return;
      }
      processFile(file, { successMessage: '粘贴图片成功' })
        .then((accepted) => {
          if (!accepted) return;
          onPastedImage?.(file);
        })
        .catch(() => {});
    },
    [processFile, onPastedImage],
  );

  useEffect(() => {
    if (!listenGlobalPaste) return;
    document.addEventListener('paste', handleGlobalPaste);
    return () => {
      document.removeEventListener('paste', handleGlobalPaste);
    };
  }, [listenGlobalPaste, handleGlobalPaste]);

  const props: UploadProps = {
    maxCount: 1,
    showUploadList: false,
    accept: 'image/*',
    beforeUpload: handleBeforeUpload,
  };

  const dropZoneStyle: React.CSSProperties = {
    display: 'inline-block',
    padding: isDragging ? '20px 24px' : '12px 16px',
    border: `2px dashed ${isDragging ? '#1677ff' : '#d9d9d9'}`,
    borderRadius: 8,
    background: isDragging ? '#f0f5ff' : '#fafafa',
    transition: 'all 0.2s',
    outline: 'none',
  };

  return (
    <div
      onPaste={handlePaste}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      tabIndex={0}
      role="region"
      aria-label="图片上传区（可点击、粘贴或拖拽上传）"
      style={dropZoneStyle}
    >
      <Space direction="vertical" size={8}>
        {/*
          用一层带 onPaste/onDrop 的 wrapper 覆盖整个上传卡片区域。
          用户在卡片内任意位置按 Ctrl+V 或拖拽图片，都会走统一校验流程
          （大小 / MIME / 目标存储 → Modal → 缩略图 → /uploads）。
          焦点/拖拽不在此卡片时，事件不会冒泡到这里，因此不会劫持全局行为。
        */}
        <Upload {...props}>
          <Button icon={<UploadOutlined />} loading={uploading}>
            {value ? '重新上传' : '上传图片'}
          </Button>
        </Upload>
        <div style={{ fontSize: 12, color: '#999' }}>
          支持点击上传、Ctrl+V 粘贴、拖拽图片到此处
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
    </div>
  );
}
