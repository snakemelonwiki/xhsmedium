import React from 'react';
import { Checkbox, Space, Typography } from 'antd';

type DeliveryHeaderExtraProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
};

/**
 * 交付信息卡片右上角说明区。
 * 同时承载保存提示与“机构接单”勾选项，便于与旧版页面位置保持一致。
 */
export function DeliveryHeaderExtra({ checked, onChange }: DeliveryHeaderExtraProps) {
  return (
    <Space size={16} align="center">
      <Typography.Text type="secondary">保存后同步到订单交付资料。</Typography.Text>
      <Checkbox checked={checked} onChange={(event) => onChange(event.target.checked)}>
        机构接单
      </Checkbox>
    </Space>
  );
}
