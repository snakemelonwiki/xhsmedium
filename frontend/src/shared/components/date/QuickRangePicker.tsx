'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Button, DatePicker, Select, Space } from 'antd';
import type { RangePickerProps } from 'antd/es/date-picker';
import dayjs from 'dayjs';

import {
  buildLastRange,
  calendarStartOf,
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
  /** 透传给 antd RangePicker 的其他 props（value/onChange/disabled/已被本组件占用，禁止覆盖）。 */
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
 *
 * 重要:周一日历特性下,「今日」与「本周」在 isPresetMatch 上逻辑等价(都是
 * [周一 00:00, 当前时间])。如果仅按"首个匹配预设"判定 activeKey,周一
 * 点「本周」按钮会被「今日」抢高亮,RangePicker 也不会"看起来"变动。
 * 修复: 记录用户最近一次主动点击的 preset key,优先用这个 key 作为 activeKey
 * (即使其它预设也匹配);一旦 value 不再匹配最近点击的 preset (例如用户手动改 RangePicker),
 * 自动回退到首个匹配的 preset key;value 完全不匹配任何 preset 时,activeKey = null。
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
  // 第一个匹配的预设 key(任意 value,纯静态计算)。
  const firstMatchKey = useMemo<string | null>(() => {
    if (!value) return null;
    for (const p of presets) {
      if (isPresetMatch(value, p.unit, p.n, p.mode)) return p.key;
    }
    return null;
  }, [value, presets]);

  // 用户最近一次主动点击的 preset key;手动改 RangePicker 后会被重置。
  // ref + state 双向: ref 拿到最新值(在 effect 内),state 触发重渲染。
  const [lastClickedKey, setLastClickedKey] = useState<string | null>(null);
  const lastClickedKeyRef = useRef<string | null>(null);

  // value 与最近点击的 preset 失去匹配 → 清空(用户手动改过日期)。
  useEffect(() => {
    if (!lastClickedKeyRef.current) return;
    const stillMatches = presets.some(
      (p) => p.key === lastClickedKeyRef.current && isPresetMatch(value, p.unit, p.n, p.mode),
    );
    if (!stillMatches) {
      lastClickedKeyRef.current = null;
      setLastClickedKey(null);
    }
  }, [value, presets]);

  // 匹配当前 value 的预设 key,用于按钮高亮 / Select 选中。
  // 优先级: 用户最近点击的 key > 首个匹配 key > null。
  const activeKey = lastClickedKey ?? firstMatchKey;

  const handlePresetClick = (p: DateRangePreset) => {
    if (disabled) return;
    lastClickedKeyRef.current = p.key;
    setLastClickedKey(p.key);
    if (p.mode === 'calendar') {
      // 用 calendarStartOf 保证 week = 周一开始，month/year/day 也对齐自然周期。
      // 不依赖 dayjs 全局 locale 设置。
      onChange({ start: calendarStartOf(p.unit), end: dayjs() });
    } else {
      onChange(buildLastRange(p.unit, p.n));
    }
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
          // 修复（2026-06-23）：antd Select 选同一项时 onChange 不会再次触发，
          // 用户点"今日"以为已刷新，但若上一次的 value 仍是其他预设（例如初始默认或者用户手动改过 RangePicker），
          // dateRange 不会更新 → 体感是"选了今日还是上次的数据"。
          // 同时给 onSelect 处理，重复点同一 key 也强制重算一次预设范围（now 也会刷新到当前时刻）。
          onSelect={(key) => {
            if (key === undefined || key === null) return;
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
