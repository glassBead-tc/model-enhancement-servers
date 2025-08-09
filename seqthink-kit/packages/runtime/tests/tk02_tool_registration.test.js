import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerTool, runPlan } from '../src/index.js';
const bridge = { complete: async () => ({ text: 'ok' }) };
registerTool({ name: 'square', async handler(input) { return Number(input) ** 2; } });
test('TK02 Tool Registration works and missing tool rejected', async () => {
    const okPlan = { id: 'ok', steps: [{ id: 't', kind: 'think', prompt: 'hi' }, { id: 's', kind: 'tool', toolName: 'square', input: 3 }] };
    const { vars } = await runPlan(okPlan, { bridge });
    assert.equal(vars.s, 9);
    const badPlan = { id: 'bad', steps: [{ id: 'n', kind: 'tool', toolName: 'not_there', input: 1 }] };
    let threw = false;
    try {
        await runPlan(badPlan, { bridge });
    }
    catch {
        threw = true;
    }
    assert.equal(threw, true);
});
//# sourceMappingURL=tk02_tool_registration.test.js.map