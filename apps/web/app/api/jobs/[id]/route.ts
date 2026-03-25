import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

const API_BASE = process.env.API_URL ?? 'http://localhost:3001';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const { getToken } = auth();
  const token = await getToken();

  const res = await fetch(`${API_BASE}/jobs/${params.id}`, {
    headers: { Authorization: `Bearer ${token ?? ''}` },
    cache: 'no-store',
  });

  const data: unknown = await res.json();
  return NextResponse.json(data, { status: res.status });
}
