import { kv } from '@vercel/kv';

// GET /api/kv/[key]  ->  { value: string | null }
export async function GET(request, { params }) {
  const { key } = params;
  try {
    const value = await kv.get(key);
    return Response.json({ value: value ?? null });
  } catch (e) {
    console.error('KV GET napaka:', e);
    return Response.json({ value: null, error: 'kv_error' }, { status: 500 });
  }
}

// PUT /api/kv/[key]  body: { value: string }
export async function PUT(request, { params }) {
  const { key } = params;
  try {
    const body = await request.json();
    await kv.set(key, body.value);
    return Response.json({ ok: true });
  } catch (e) {
    console.error('KV PUT napaka:', e);
    return Response.json({ ok: false, error: 'kv_error' }, { status: 500 });
  }
}
