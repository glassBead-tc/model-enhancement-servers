import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runPlan, replayPlan, registerTool } from '../src/index.js';
let toolCalls = 0;
registerTool({ name: 'count', async handler(input) { toolCalls += 1; return Number(input) + 2; } });
const bridge = { complete: async (p) => ({ text: p.toUpperCase() }) };
test('TK03 Trace & Replay', async () => {
    const plan = { id: 'rr', steps: [{ id: 'a', kind: 'think', prompt: 'abc' }, { id: 'b', kind: 'tool', toolName: 'count', input: 5, assign: 'val' }] };
    const first = await runPlan(plan, { bridge });
    const trace = first.trace.toJSON();
    const replay = await replayPlan(plan, trace);
    assert.equal(replay.vars.a, first.vars.a);
    assert.equal(replay.vars.b, first.vars.b);
    assert.equal(replay.vars.val, first.vars.val);
    const before = toolCalls;
    await replayPlan(plan, trace);
    const after = toolCalls;
    assert.equal(after, before);
});
//# sourceMappingURL=tk03_trace_replay.test.js.map