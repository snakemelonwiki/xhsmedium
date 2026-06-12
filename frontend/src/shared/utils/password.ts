/**
 * 密码强度校验。
 * 规则：8-20 位，不允许空格，且至少包含大写字母、小写字母、数字、特殊字符中的 2 种。
 */
export interface PasswordValidationResult {
  valid: boolean;
  message: string;
}

export function validatePasswordStrength(password: string): PasswordValidationResult {
  const value = String(password ?? '');
  if (!value) {
    return { valid: false, message: '请输入密码' };
  }
  if (value.length < 8 || value.length > 20) {
    return { valid: false, message: '密码长度需为 8-20 位' };
  }
  if (/\s/.test(value)) {
    return { valid: false, message: '密码不能包含空格' };
  }

  let types = 0;
  if (/[A-Z]/.test(value)) types += 1;
  if (/[a-z]/.test(value)) types += 1;
  if (/\d/.test(value)) types += 1;
  if (/[^A-Za-z0-9\s]/.test(value)) types += 1;

  if (types < 2) {
    return { valid: false, message: '密码需包含大写字母、小写字母、数字、特殊字符中的至少两种' };
  }

  return { valid: true, message: '' };
}
