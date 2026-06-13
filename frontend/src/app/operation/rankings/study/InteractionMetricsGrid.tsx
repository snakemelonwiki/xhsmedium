import {
  BlockOutlined,
  CommentOutlined,
  HeartOutlined,
  LikeOutlined,
} from '@ant-design/icons';
import { Tag } from 'antd';
import React from 'react';
import type { CSSProperties } from 'react';

interface InteractionMetricsGridProps {
  likes: number;
  comments: number;
  favorites: number;
  shares: number;
}

const gridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gridTemplateRows: 'repeat(2, auto)',
  gridAutoFlow: 'column',
  gap: 4,
  width: 144,
};

const tagStyle: CSSProperties = {
  marginInlineEnd: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

/**
 * 固定展示学习榜单的互动指标，避免表格列宽变化时自动换成不规则行数。
 */
export function InteractionMetricsGrid({
  likes,
  comments,
  favorites,
  shares,
}: InteractionMetricsGridProps) {
  return (
    <div style={gridStyle}>
      <Tag icon={<LikeOutlined />} style={tagStyle}>赞 {likes}</Tag>
      <Tag icon={<CommentOutlined />} style={tagStyle}>评 {comments}</Tag>
      <Tag icon={<HeartOutlined />} style={tagStyle}>藏 {favorites}</Tag>
      <Tag icon={<BlockOutlined />} style={tagStyle}>转 {shares}</Tag>
    </div>
  );
}
