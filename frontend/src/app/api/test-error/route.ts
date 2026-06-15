import { NextResponse } from 'next/server';

export async function POST() {
  // 模拟后端返回用户名重复错误
  return NextResponse.json(
    { message: '用户名已存在' },
    { status: 400 }
  );
}
