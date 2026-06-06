'use client';

import React, { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { Button, DatePicker, Select, Space } from 'antd';
import type { RangePickerProps } from 'antd/es/date-picker';

import {
  buildLastRange,
  DEFAULT_RANGE_PRESETS,
  isPresetMatch,
  type DateRangePreset,
  type DateRangeValue,
} from '@/shared/utils/date-range';

export type { DateRangeValue } from '@/shared/utils/date-range';

export type QuickRangePickerVariant = 'buttons' | 'select';

export type QuickRangePickerProps = {
  value: DateRangeValue;
  onChange: (next: DateRangeValue) => void;
  /** 预设按钮列表，默认 6 个。传空数组则只显示 RangePicker。 */
  presets?: ReadonlyArray<DateRangePreset>;
  /** 布局：'buttons' = 平铺按钮（适合 ≤6 个预设），'select' = Select 下拉（适合 ≥6 个预设）。默认 'buttons'。 */
  variant?: QuickRangePickerVariant;
  /** 整体禁用：预设按钮和 RangePicker 一起置灰。 */
  disabled?: boolean;
  /** 是否允许清空（透传给 antd RangePicker.allowClear）。默认 true。 */
  allowClear?: boolean;
  /** 透传给 antd RangePicker 的其他 props（value/onChange/disabled 已被本组件占用，禁止覆盖）。 */
  pickerProps?: Omit<RangePickerProps, 'value' | 'onChange' | 'disabled' | 'allowClear'>;
  className?: string;
  style?: CSSProperties;
  /** buttons 模式下单个预设按钮的尺寸。默认 'small'，跟现有 FilterBar 内筛选控件保持紧凑。select 模式忽略。 */
  presetSize?: 'small' | 'middle';
  /** select 模式占位文本。默认 '选择时间段'。 */
  selectPlaceholder?: string;
  /** select 模式宽度。默认 160。 */
  selectWidth?: number;
};

const { RangePicker } = DatePicker;

/**
 * 时间范围快捷选择：受控 API。
 * - variant='buttons'：平铺预设按钮 + RangePicker（适合 ≤6 个预设）
 * - variant='select'：Select 下拉 + RangePicker（适合 ≥6 个预设）
 * 点预设 → onChange 出对应 [now - n*unit, now]；手动改 RangePicker → 预设高亮/选中态自然清空。
 */
export function QuickRangePicker({
  value,
  onChange,
  presets = DEFAULT_RANGE_PRESETS,
  variant = 'buttons',
  disabled,
  allowClear = true,
  pickerProps,
  className,
  style,
  presetSize = 'small',
  selectPlaceholder = '选择时间段',
  selectWidth = 160,
}: QuickRangePickerProps) {
  // 匹配当前 value 的预设 key，用于按钮高亮 / Select 选中。空值 / 改过时间都返回 null。
  const activeKey = useMemo(() => {
    if (!value) return null;
    for (const p of presets) {
      if (isPresetMatch(value, p.unit, p.n)) return p.key;
    }
    return null;
  }, [value, presets]);

  const handlePresetClick = (p: DateRangePreset) => {
    if (disabled) return;
    onChange(buildLastRange(p.unit, p.n));
  };

  const handlePickerChange: RangePickerProps['onChange'] = (dates) => {
    if (!dates || !dates[0] || !dates[1]) {
      onChange(null);
      return;
    }
    onChange({ start: dates[0], end: dates[1] });
  };

  return (
    <Space wrap className={className} style={style}>
      {variant === 'buttons' ? (
        presets.map((p) => (
          <Button
            key={p.key}
            size={presetSize}
            type={activeKey === p.key ? 'primary' : 'default'}
            disabled={disabled}
            onClick={() => handlePresetClick(p)}
          >
            {p.label}
          </Button>
        ))
      ) : (
        <Select
          style={{ width: selectWidth }}
          value={activeKey ?? undefined}
          placeholder={selectPlaceholder}
          disabled={disabled}
          allowClear
          onChange={(key) => {
            if (key === undefined || key === null) {
              onChange(null);
              return;
            }
            const p = presets.find((it) => it.key === key);
            if (p) handlePresetClick(p);
          }}
          options={presets.map((p) => ({ label: p.label, value: p.key }))}
        />
      )}
      <RangePicker
        value={value ? [value.start, value.end] : null}
        onChange={handlePickerChange}
        disabled={disabled}
        allowClear={allowClear}
        {...pickerProps}
      />
    </Space>
  );
}
