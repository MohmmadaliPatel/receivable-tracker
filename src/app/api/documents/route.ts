import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
import { PassThrough } from 'stream';
import { cookies } from 'next/headers';
import { getSession } from '@/lib/simple-auth';

const EMAIL_BASE = path.join(process.cwd(), 'emails');

interface FileNode {
  name: string;
  path: string;   // relative from emails/
  type: 'file' | 'folder';
  size?: number;
  modified?: string;
  children?: FileNode[];
}

function buildTree(absDir: string, relBase: string = ''): FileNode[] {
  if (!fs.existsSync(absDir)) return [];
  const entries = fs.readdirSync(absDir, { withFileTypes: true });
  const nodes: FileNode[] = [];

  for (const entry of entries) {
    const rel = relBase ? `${relBase}/${entry.name}` : entry.name;
    const abs = path.join(absDir, entry.name);
    if (entry.isDirectory()) {
      nodes.push({
        name: entry.name,
        path: rel,
        type: 'folder',
        children: buildTree(abs, rel),
      });
    } else if (entry.isFile() && !entry.name.startsWith('.')) {
      const stat = fs.statSync(abs);
      nodes.push({
        name: entry.name,
        path: rel,
        type: 'file',
        size: stat.size,
        modified: stat.mtime.toISOString(),
      });
    }
  }

  // Folders first, then files; both alphabetical
  nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return nodes;
}

function safePath(rel: string): string | null {
  if (!rel) return EMAIL_BASE;
  const resolved = path.resolve(EMAIL_BASE, rel);
  if (!resolved.startsWith(EMAIL_BASE)) return null; // path traversal guard
  return resolved;
}

// GET /api/documents?action=tree               → full folder tree
// GET /api/documents?action=file&path=...      → serve raw HTML content (for preview)
// GET /api/documents?action=download&path=...  → download single file
// GET /api/documents?action=zip&path=...       → download folder as ZIP
async function getAuthUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get('session_token')?.value;
  if (!token) return null;
  return await getSession(token);
}

export async function GET(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const action = req.nextUrl.searchParams.get('action') || 'tree';
  const relPath = req.nextUrl.searchParams.get('path') || '';

  if (action === 'tree') {
    const tree = buildTree(EMAIL_BASE);
    return NextResponse.json({ tree });
  }

  const absPath = safePath(relPath);
  if (!absPath) return NextResponse.json({ error: 'Invalid path' }, { status: 400 });

  if (action === 'file') {
    if (!fs.existsSync(absPath) || !fs.statSync(absPath).isFile()) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }
    const ext = absPath.split('.').pop()?.toLowerCase() || '';
    if (ext === 'html') {
      const content = fs.readFileSync(absPath, 'utf-8');
      return NextResponse.json({ content });
    }
    // Binary files (PDF, images, attachments, etc.)
    const content = fs.readFileSync(absPath);
    const mimeMap: Record<string, string> = {
      pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
      gif: 'image/gif', doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };
    return new NextResponse(content, {
      headers: {
        'Content-Type': mimeMap[ext] || 'application/octet-stream',
        'Content-Disposition': `inline; filename="${path.basename(absPath)}"`,
      },
    });
  }

  if (action === 'download') {
    if (!fs.existsSync(absPath) || !fs.statSync(absPath).isFile()) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }
    const content = fs.readFileSync(absPath);
    const filename = path.basename(absPath);
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    const mimeMap: Record<string, string> = {
      pdf: 'application/pdf', html: 'text/html; charset=utf-8',
      png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
      doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
    return new NextResponse(content, {
      headers: {
        'Content-Type': mimeMap[ext] || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  }

  if (action === 'zip') {
    if (!fs.existsSync(absPath) || !fs.statSync(absPath).isDirectory()) {
      return NextResponse.json({ error: 'Folder not found' }, { status: 404 });
    }

    // Stream the ZIP to the response
    const folderName = path.basename(absPath) || 'emails';
    const passThrough = new PassThrough();
    const archive = archiver('zip', { zlib: { level: 6 } });

    archive.on('error', (err) => {
      console.error('[Documents] Archiver error:', err);
      passThrough.destroy(err);
    });

    archive.pipe(passThrough);
    archive.directory(absPath, folderName);
    archive.finalize();

    // Collect all chunks and return
    const chunks: Buffer[] = [];
    for await (const chunk of passThrough) {
      chunks.push(chunk as Buffer);
    }
    const zipBuffer = Buffer.concat(chunks);

    return new NextResponse(zipBuffer, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${folderName}.zip"`,
      },
    });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
