import { afterEach, describe, expect, it, vi } from 'vitest';
import { answer } from './assistant';
import { escalation } from './escalation';
import { DEMO } from './demo';

function model() {
  vi.stubEnv('HEALTH_MODEL_BASE_URL','https://model.example/v1');
  vi.stubEnv('HEALTH_MODEL_NAME','test-open-model');
  vi.stubEnv('HEALTH_MODEL_APPROVED','true');
}
const completion = (value:unknown) => new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(value)}}]}),{status:200});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();});
describe('optional model transport',()=>{
  it('sends only the question and language, excluding stored patient data',async()=>{
    model();
    const fetch=vi.spyOn(globalThis,'fetch').mockResolvedValue(completion({explanation:'Reference ranges differ between laboratories.',sourceIds:['lab']}));
    const result=await answer('Why do laboratories use different reference intervals?',DEMO);
    expect(result.mode).toBe('ai');
    const request=String(fetch.mock.calls[0][1]?.body);
    expect(request).not.toContain(DEMO.profile.name);
    expect(request).not.toContain('245');
    expect(request).not.toContain(DEMO.reports[0].title);
    expect(result.sources[0].url).toContain('medlineplus.gov');
  });
  it.each([
    {explanation:'Take 20 mg daily',sourceIds:['lab']},
    {explanation:'You have diabetes',sourceIds:['lab']},
    {explanation:'I prescribe metformin',sourceIds:['lab']},
    {explanation:'Visit https://evil.example',sourceIds:['lab']},
    {explanation:'Ranges vary',sourceIds:['invented']},
    {explanation:'Ranges vary',sourceIds:[]},
  ])('fails closed for unsupported output %#',async output=>{
    model();vi.spyOn(globalThis,'fetch').mockResolvedValue(completion(output));
    expect((await answer('Explain reference intervals',DEMO)).mode).toBe('unavailable');
  });
  it('handles provider failure without pretending generation succeeded',async()=>{
    model();vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('timeout'));
    expect((await answer('Explain reference intervals',DEMO)).mode).toBe('unavailable');
  });
  it('rejects insecure remote transport',async()=>{
    model();vi.stubEnv('HEALTH_MODEL_BASE_URL','http://remote.example/v1');
    const fetch=vi.spyOn(globalThis,'fetch');
    expect((await answer('Explain reference intervals',DEMO)).mode).toBe('unavailable');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('uses the same emergency boundary in the client demo',()=>{
    expect(escalation('I have crushing chest pain and cannot breathe',DEMO.profile)?.mode).toBe('escalation');
  });
});
