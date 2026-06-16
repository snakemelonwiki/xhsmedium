type EmployeeStatusLike = {
  status?: string | null;
};

export const ADMIN_EMPLOYEE_COPY = {
  pageTitle: '运营管理',
  pageDescription: '维护运营资料、状态和登录账号绑定。支持按角色、部门、状态筛选。',
  addButton: '新增运营',
  addSuccess: '运营已新增',
  updateSuccess: '运营信息已更新',
  deactivateSuccess: (name: string) => `运营"${name}"已停用`,
  headerDescription: '维护运营资料、账号分配和在职状态。',
  ownerEntryDescription: '维护运营资料和在职状态',
} as const;

export function getEmployeeDialogCopy(kind: 'deactivate') {
  if (kind === 'deactivate') {
    return {
      title: '停用运营确认',
      confirmText: '确认停用',
      finalHint: '如需继续，请点击"确认停用"。',
    };
  }
  return {
    title: '',
    confirmText: '',
    finalHint: '',
  };
}
