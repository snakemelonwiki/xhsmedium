// 颜色与 POST_TYPE_GROUPS（运营/主管 account-analysis page.tsx）保持一致：
// 获客帖 #fa8c16 / 讨论帖 #1677ff / 人设帖 #52c41a。
export const ACCOUNT_ANALYSIS_LEGEND = {
  leadPost: { color: '#fa8c16', text: '获客帖' },
  discussionPost: { color: '#1677ff', text: '讨论帖' },
  personaPost: { color: '#52c41a', text: '人设帖' },
  empty: { color: '#d9d9d9', text: '未发' },
} as const;
