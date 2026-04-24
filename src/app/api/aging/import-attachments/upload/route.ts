import { NextRequest, NextResponse } from 'next/server';
import AdmZip from 'adm-zip';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { getCurrentUser } from '@/lib/simple-auth';
import { prisma } from '@/lib/prisma';
import {
  AGING_IMPORT_ATTACH_BASE,
  extractCodeFromTemplateFolderName,
  listTemplateCustomersForImport,
} from '@/lib/aging-import-attachments';

const MAX_ZIP_BYTES = 80 * 1024 * 1024;
const MAX_ENTRIES = 5000;
const MAX_TOTAL_UNCOMPRESSED = 200 * 1024 * 1024;

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\/+/, '');
}

function isSkippableFile(name: string): boolean {
  const base = name.split('/').pop() || name;
  const lower = base.toLowerCase();
  if (lower === '.ds_store' || lower === 'thumbs.db') return true;
  if (lower === '.placeholder' || lower === '.gitkeep') return true;
  if (name.toLowerCase().includes('__macosx/')) return true;
  return false;
}

function computeStripRoot(
  normPaths: string[],
  extract: (f: string) => string | null
): string | null {
  const withSeg = normPaths.filter((p) => p.length > 0);
  if (withSeg.length === 0) return null;
  const roots = new Set(withSeg.map((p) => p.split('/')[0]!));
  if (roots.size !== 1) return null;
  const r = [...roots][0]!;
  if (extract(r)) return null;
  if (withSeg.every((p) => p === r || p.startsWith(r + '/'))) return r;
  return null;
}

function toVirtual(p: string, root: string | null): string {
  if (!root) return p;
  if (p === root) return '';
  if (p.startsWith(root + '/')) return p.slice(root.length + 1);
  return p;
}

type FileIndex = { raw: string; v: string };

function pickBestFileInFolder(
  virtualPaths: string[],
  folder: string
): { fullVirtualPath: string; relative: string } | null {
  const prefix = folder + '/';
  const candidates: string[] = [];
  for (const fp of virtualPaths) {
    if (!fp.startsWith(prefix) || fp.length <= prefix.length) continue;
    if (isSkippableFile(fp)) continue;
    candidates.push(fp);
  }
  if (candidates.length === 0) return null;
  const pdfs = candidates.filter((c) => c.toLowerCase().endsWith('.pdf'));
  const pool = pdfs.length > 0 ? pdfs : candidates;
  pool.sort((a, b) => a.localeCompare(b));
  const fullVirtualPath = pool[0]!;
  return { fullVirtualPath, relative: fullVirtualPath.slice(prefix.length) };
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const importId = (formData.get('importId') as string | null)?.trim();
    const file = formData.get('file') as File | null;
    if (!importId || !file) {
      return NextResponse.json({ error: 'Missing importId or file' }, { status: 400 });
    }

    if (file.size > MAX_ZIP_BYTES) {
      return NextResponse.json(
        { error: `ZIP too large (max ${MAX_ZIP_BYTES / (1024 * 1024)} MB).` },
        { status: 400 }
      );
    }

    const imp = await prisma.agingImport.findFirst({
      where: { id: importId, userId: user.id },
    });
    if (!imp) {
      return NextResponse.json({ error: 'Import not found' }, { status: 404 });
    }

    const allowed = await listTemplateCustomersForImport(user.id, importId, null);
    const byCode = new Map(allowed.map((a) => [a.customerCode, a]));
    const folderNameByCode = new Map(allowed.map((a) => [a.customerCode, a.folderName]));

    const ab = await file.arrayBuffer();
    const buf = Buffer.from(ab);
    if (buf.length > MAX_ZIP_BYTES) {
      return NextResponse.json({ error: 'ZIP too large' }, { status: 400 });
    }

    let zip: AdmZip;
    try {
      zip = new AdmZip(buf);
    } catch {
      return NextResponse.json({ error: 'Invalid or corrupted ZIP' }, { status: 400 });
    }

    const rawEntries = zip.getEntries();
    if (rawEntries.length > MAX_ENTRIES) {
      return NextResponse.json({ error: 'Too many files in archive' }, { status: 400 });
    }

    let totalUncomp = 0;
    for (const e of rawEntries) {
      totalUncomp += e.header.size;
    }
    if (totalUncomp > MAX_TOTAL_UNCOMPRESSED) {
      return NextResponse.json({ error: 'Uncompressed size too large' }, { status: 400 });
    }

    const allFilePaths: string[] = [];
    for (const e of rawEntries) {
      if (e.isDirectory) continue;
      allFilePaths.push(normalizePath(e.entryName));
    }
    if (allFilePaths.length === 0) {
      return NextResponse.json({ error: 'Empty ZIP' }, { status: 400 });
    }

    const stripRoot = computeStripRoot(allFilePaths, extractCodeFromTemplateFolderName);
    const fileIndex: FileIndex[] = [];
    const virtualList: string[] = [];
    for (const raw of allFilePaths) {
      if (isSkippableFile(raw)) continue;
      const v = toVirtual(raw, stripRoot);
      if (!v) continue;
      if (isSkippableFile(v)) continue;
      fileIndex.push({ raw, v });
      virtualList.push(v);
    }

    if (fileIndex.length === 0) {
      return NextResponse.json({ error: 'No non-placeholder files in ZIP' }, { status: 400 });
    }

    const byFolder = new Map<string, FileIndex[]>();
    for (const fi of fileIndex) {
      const seg0 = fi.v.split('/')[0]!;
      if (!seg0) continue;
      if (!byFolder.has(seg0)) byFolder.set(seg0, []);
      byFolder.get(seg0)!.push(fi);
    }

    const uploadBase = join(process.cwd(), AGING_IMPORT_ATTACH_BASE, user.id, importId);
    if (!existsSync(uploadBase)) {
      await mkdir(uploadBase, { recursive: true });
    }

    let created = 0;
    let updated = 0;
    const errors: string[] = [];
    const warnings: string[] = [];

    for (const [folderName] of byFolder) {
      const code = extractCodeFromTemplateFolderName(folderName);
      if (!code) {
        errors.push(
          `Folder "${folderName}": could not parse customer code from name (use "Name (code)" format).`
        );
        continue;
      }
      if (!byCode.has(code)) {
        errors.push(
          `Folder "${folderName}": customer code "${code}" is not in this import (or has no positive balance).`
        );
        continue;
      }
      const row = byCode.get(code)!;
      const expectFolder = folderNameByCode.get(code);
      if (expectFolder && expectFolder !== folderName) {
        warnings.push(
          `Folder "${folderName}": name differs from template "${expectFolder}"; using code ${code} from parentheses.`
        );
      }
      const pick2 = pickBestFileInFolder(virtualList, folderName);
      if (!pick2) {
        errors.push(
          `Folder "${folderName}": no attachable file (add a PDF or document; placeholder-only is ignored).`
        );
        continue;
      }

      const fi = fileIndex.find((x) => x.v === pick2.fullVirtualPath);
      if (!fi) {
        errors.push(`Folder "${folderName}": could not map "${pick2.fullVirtualPath}".`);
        continue;
      }

      const entry = rawEntries.find((e) => !e.isDirectory && normalizePath(e.entryName) === fi.raw);
      if (!entry) {
        errors.push(`Folder "${folderName}": could not read "${fi.raw}".`);
        continue;
      }
      let data: Buffer;
      try {
        data = entry.getData();
      } catch {
        errors.push(`Folder "${folderName}": read failed.`);
        continue;
      }
      if (data.length > 30 * 1024 * 1024) {
        errors.push(`Folder "${folderName}": file too large (max 30 MB).`);
        continue;
      }

      const uniquePart = `${Date.now()}_${code.replace(/[^a-zA-Z0-9-_]/g, '_')}_`;
      const origName = pick2.fullVirtualPath.split('/').pop() || 'file';
      const safeName = origName.replace(/[^a-zA-Z0-9.-]/g, '_');
      const fullDisk = join(
        process.cwd(),
        AGING_IMPORT_ATTACH_BASE,
        user.id,
        importId,
        uniquePart + safeName
      );
      const newRel = [AGING_IMPORT_ATTACH_BASE, user.id, importId, uniquePart + safeName].join('/');

      const existing = await prisma.agingImportCustomerAttachment.findFirst({
        where: { importId, customerCode: code },
      });
      if (existing) {
        try {
          const oldPath = join(process.cwd(), existing.filePath);
          if (existsSync(oldPath)) await unlink(oldPath);
        } catch {
          // ignore
        }
        await writeFile(fullDisk, data);
        await prisma.agingImportCustomerAttachment.update({
          where: { id: existing.id },
          data: {
            customerName: row.customerName,
            filePath: newRel,
            fileName: origName,
            mime: null,
            updatedAt: new Date(),
          },
        });
        updated++;
      } else {
        await writeFile(fullDisk, data);
        await prisma.agingImportCustomerAttachment.create({
          data: {
            userId: user.id,
            importId,
            customerCode: code,
            customerName: row.customerName,
            filePath: newRel,
            fileName: origName,
            mime: null,
          },
        });
        created++;
      }
    }

    return NextResponse.json({ created, updated, errors, warnings, success: true });
  } catch (error) {
    console.error('[import-attachments upload] Error:', error);
    const message = error instanceof Error ? error.message : 'Upload failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
