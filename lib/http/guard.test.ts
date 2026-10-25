import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkRateShared, readJsonCapped } from './guard';
describe('bounded request streaming',()=>{
  it('counts UTF-8 bytes rather than characters',async()=>{
    const request=new Request('http://localhost',{method:'POST',body:JSON.stringify({x:'अ'.repeat(30)})});
    expect(await readJsonCapped(request,60)).toMatchObject({ok:false,status:413});
  });
  it('cancels a chunked stream as soon as the byte cap is exceeded',async()=>{
    let cancelled=false;
    const stream=new ReadableStream({pull(c){c.enqueue(new Uint8Array(40));},cancel(){cancelled=true;}});
    const request=new Request('http://localhost',{method:'POST',body:stream,duplex:'half'} as RequestInit);
    expect(await readJsonCapped(request,60)).toMatchObject({ok:false,status:413});expect(cancelled).toBe(true);
  });
  it('accepts valid multibyte JSON below the cap',async()=>{
    expect(await readJsonCapped(new Request('http://localhost',{method:'POST',body:'{"name":"आरव"}'}),100)).toEqual({ok:true,value:{name:'आरव'}});
  });
});

describe("checkRateShared", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("falls back to the local counter without Redis settings", async () => {
    const key = `shared-local-${Math.random()}`;
    expect(await checkRateShared(key, 1, 60_000)).toEqual({ ok: true });
    expect(await checkRateShared(key, 1, 60_000)).toMatchObject({ ok: false });
  });

  it("uses the Redis count when configured, and blocks past the limit", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.example");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "t");
    const reply = (count: number) => Response.json([{ result: count }, { result: 1 }, { result: 30_000 }]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(reply(2)).mockResolvedValueOnce(reply(3)));
    expect(await checkRateShared("k", 2, 60_000)).toEqual({ ok: true });
    expect(await checkRateShared("k", 2, 60_000)).toEqual({ ok: false, retryAfter: 30 });
  });

  it("falls back when Redis is down", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.example");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "t");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
    expect(await checkRateShared(`down-${Math.random()}`, 1, 60_000)).toEqual({ ok: true });
  });
});
