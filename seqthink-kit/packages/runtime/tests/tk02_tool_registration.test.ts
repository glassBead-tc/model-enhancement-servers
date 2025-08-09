import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerTool, runPlan, type ThoughtPlan, type Bridge } from '../src/index.js';

const bridge: Bridge = { complete: async () => ({ text: 'ok' }) };

registerTool({ name: 'square', async handler(input: any) { return Number(input) ** 2; } });

test('TK02 Tool Registration works and missing tool rejected', async () => {
  const okPlan: ThoughtPlan = { id: 'ok', steps: [ { id: 't', kind: 'think', prompt: 'hi' }, { id: 's', kind: 'tool', toolName: 'square', input: 3 } ] };
  const { vars } = await runPlan(okPlan, { bridge });
  assert.equal(vars.s, 9);

  const badPlan: ThoughtPlan = { id: 'bad', steps: [ { id: 'n', kind: 'tool', toolName: 'not_there', input: 1 } ] } as any;
  let threw = false;
  try {
    await runPlan(badPlan, { bridge });
  } catch {
    threw = true;
  }
  assert.equal(threw, true);
});