import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTrace, registerTool, runPlan, type ThoughtPlan, type Bridge } from '../src/index.js';
import { promises as fs } from 'node:fs';
import path from 'node:path';

// Simple echo think bridge
const bridge: Bridge = {
  async complete(prompt: string) {
    return { text: `ECHO:${prompt}`, usage: { prompt: prompt.length, completion: 5 } };
  }
};

// Toy tool
registerTool({
  name: 'add_one',
  async handler(input: any) {
    return Number(input) + 1;
  }
});

const outDir = path.join(process.cwd(), 'tmp-tests', 'tk01');

test('TK01 Plan Runner populates vars and persists trace', async () => {
  const plan: ThoughtPlan = {
    id: 'p1',
    steps: [
      { id: 't', kind: 'think', prompt: 'hello' },
      { id: 'u', kind: 'tool', toolName: 'add_one', input: 41, assign: 'answer' }
    ]
  };

  const { vars, trace } = await runPlan(plan, { bridge, onTokenUsage: () => {} });
  assert.equal(vars.t, 'ECHO:hello');
  assert.equal(vars.u, 42);
  assert.equal(vars.answer, 42);

  const tracePath = path.join(outDir, 'trace.json');
  await trace.persist(tracePath);
  const content = JSON.parse(await fs.readFile(tracePath, 'utf8'));
  assert.equal(content.version, 1);
  const hasThinkEnd = content.events.some((e: any) => e.type === 'think:end' && e.stepId === 't');
  const hasToolEnd = content.events.some((e: any) => e.type === 'tool:end' && e.stepId === 'u');
  assert.ok(hasThinkEnd && hasToolEnd);
});