/**
 * Optional alias: POST /api/snapshots — same as POST /api/aging/upload
 * (single Excel upload for receivable ageing snapshot).
 */
import { NextRequest, NextResponse } from 'next/server';
import { POST as agingUpload } from '../aging/upload/route';

export async function POST(request: NextRequest) {
  return agingUpload(request);
}
