import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // 10MB limit enforcement
    const MAX_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: 'File exceeds 10MB limit. Please compress or choose a smaller file.' },
        { status: 400 }
      );
    }

    const fileId = `doc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const filename = file.name;

    // Simulate private storage in patient-docs bucket with signed URL
    const fileUrl = `/api/documents/${fileId}?name=${encodeURIComponent(filename)}`;

    return NextResponse.json({
      success: true,
      fileId,
      filename,
      size: file.size,
      mimeType: file.type,
      url: fileUrl,
      bucket: 'patient-docs',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Upload failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
