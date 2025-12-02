import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path } = await params;
    const filePath = path.join('/');

    // Prevent directory traversal
    if (filePath.includes('..')) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
    }

    // Docs are in the root docs folder
    const docsDir = join(process.cwd(), '..', '..', 'docs');
    const fullPath = join(docsDir, filePath);

    if (!existsSync(fullPath)) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    const content = await readFile(fullPath, 'utf-8');

    return new NextResponse(content, {
      headers: {
        'Content-Type': 'text/markdown',
      },
    });
  } catch (error) {
    console.error('Error reading doc file:', error);
    return NextResponse.json({ error: 'Failed to read file' }, { status: 500 });
  }
}
