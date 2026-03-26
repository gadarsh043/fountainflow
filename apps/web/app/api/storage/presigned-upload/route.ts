import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

const API_BASE = process.env.API_URL ?? 'http://localhost:3001/api';

export async function POST(req: NextRequest) {
  const { getToken } = auth();
  const token = await getToken();
  const body: unknown = await req.json();

  const res = await fetch(`${API_BASE}/storage/presigned-upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token ?? ''}`,
    },
    body: JSON.stringify(body),
  });

  const data: unknown = await res.json();
  return NextResponse.json(data, { status: res.status });
}
