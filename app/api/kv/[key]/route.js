import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_RESET_KV_REST_API_URL,
  token: process.env.UPSTASH_REDIS_RESET_KV_REST_API_TOKEN,
  automaticDeserialization: false,
});

// GET /api/kv/[key]  ->  { value: string | null }
export async function GET(request, { params }) {
  const { key } = params;
  try {
    const value = await redis.get(key);
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
    await redis.set(key, body.value);
    return Response.json({ ok: true });
  } catch (e) {
    console.error('KV PUT napaka:', e);
    return Response.json({ ok: false, error: 'kv_error' }, { status: 500 });
  }
}
