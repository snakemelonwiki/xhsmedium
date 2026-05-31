import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';

const contentTypes: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path: segments } = await params;
  const uploadsRoot = resolveUploadsRoot();
  const filePath = path.resolve(uploadsRoot, ...segments);

  if (!filePath.startsWith(`${uploadsRoot}${path.sep}`)) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  try {
    const body = await readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    return new NextResponse(body, {
      headers: {
        'Content-Type': contentTypes[ext] || 'application/octet-stream',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch {
    return new NextResponse('Not Found', { status: 404 });
  }
}

function resolveUploadsRoot() {
  if (process.env.UPLOADS_ROOT) return path.resolve(process.env.UPLOADS_ROOT);

  const candidates = [
    path.resolve(process.cwd(), 'uploads'),
    path.resolve(process.cwd(), '..', 'uploads'),
  ];

  return candidates.find((candidate) => existsSync(candidate)) || candidates[0];
}
