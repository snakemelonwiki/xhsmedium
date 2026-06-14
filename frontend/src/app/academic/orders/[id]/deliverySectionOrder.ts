/**
 * 返回交付信息子表单的显示顺序。
 * 机构接单时隐藏第 0 块，其余子表单顺序保持不变。
 */
export function getDeliverySectionOrder(institutionAccepted: boolean): string[] {
  const sections = ['overview', 'baseAndSubmission', 'authors', 'submissions', 'supervisor', 'journal', 'finance'];
  return institutionAccepted ? sections.filter((section) => section !== 'overview') : sections;
}
