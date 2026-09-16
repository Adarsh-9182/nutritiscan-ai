import { describe, expect, it } from 'vitest';
import { readJsonCapped } from './guard';
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
