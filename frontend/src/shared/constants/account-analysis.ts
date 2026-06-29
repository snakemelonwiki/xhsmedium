// 颜色与 POST_TYPE_GROUPS（运营/主管 account-analysis page.tsx）保持一致
// 以及 pickDayColor 返回值：
// 获客帖 #fa8c16 / 讨论帖 #1677ff / 人设帖 #52c41a / 混合帖 #722ed1 / 其他 #595959 / 未发 #d9d9d9
export const ACCOUNT_ANALYSIS_LEGEND = {
  xiaohongshu: { color: '#ff2442', text: '小红书' },
  douyin: { color: '#161616', text: '抖音' },
  empty: { color: '#d9d9d9', text: '未发' },
  leadPost: { color: '#fa8c16', text: '获客帖' },
  discussionPost: { color: '#1677ff', text: '讨论帖' },
  personaPost: { color: '#52c41a', text: '人设帖' },
  mixedPost: { color: '#722ed1', text: '混合帖' },
  otherPost: { color: '#595959', text: '其他' },
} as const;
