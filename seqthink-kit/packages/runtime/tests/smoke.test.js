import test from 'node:test';
import assert from 'node:assert/strict';
import { registerTool, runPlan } from '../src/index.js';
registerTool({ name: 'echo', async handler(input) { return { ok: true, input }; } });
test('runtime smoke', async () => {
    const { vars } = await runPlan({ id: 't', steps: [
            { id: 'a', kind: 'think', prompt: 'hello' },
            { id: 'b', kind: 'tool', toolName: 'echo', input: { x: 1 }, assign: 'res' }
        ] });
    assert.equal(vars.res.ok, true);
});
//# sourceMappingURL=smoke.test.js.map