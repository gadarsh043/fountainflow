import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

const API_BASE = process.env.API_URL ?? 'http://localhost:3001';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const { getToken } = auth();
  const token = await getToken();

  const res = await fetch(`${API_BASE}/projects/${params.id}`, {
    headers: { Authorization: `Bearer ${token ?? ''}` },
    cache: 'no-store',
  });

  const data: unknown = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const { getToken } = auth();
  const token = await getToken();
  const body: unknown = await req.json();

  const res = await fetch(`${API_BASE}/projects/${params.id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token ?? ''}`,
    },
    body: JSON.stringify(body),
  });

  const data: unknown = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const { getToken } = auth();
  const token = await getToken();

  const res = await fetch(`${API_BASE}/projects/${params.id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token ?? ''}` },
  });

  if (res.status === 204) return new NextResponse(null, { status: 204 });
  const data: unknown = await res.json();
  return NextResponse.json(data, { status: res.status });
}
