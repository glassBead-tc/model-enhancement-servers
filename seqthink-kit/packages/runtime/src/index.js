// @seqthink/runtime — core types + minimal loop stub
const _tools = new Map();
export function registerTool(reg) { _tools.set(reg.name, reg); }
export function getRegisteredTools() { return Array.from(_tools.values()); }
import { createTrace } from './trace.js';
export async function runPlan(plan, opts = {}) {
    const trace = createTrace();
    const vars = {};
    const env = opts.env ?? process.env;
    trace.add({ ts: Date.now(), type: 'plan:start', planId: plan.id });
    try {
        for (const step of plan.steps) {
            if (step.kind === 'think') {
                trace.add({ ts: Date.now(), type: 'think:start', stepId: step.id, prompt: step.prompt });
                const tp = opts.thinkProvider;
                const text = tp ? (await tp.complete(step.prompt, step.system, { stop: step.stop })).text : '[stub: think output]';
                vars[step.id] = text;
                trace.add({ ts: Date.now(), type: 'think:end', stepId: step.id, output: text });
            }
            else {
                const tool = _tools.get(step.toolName);
                if (!tool)
                    throw new Error(`Tool not registered: ${step.toolName}`);
                trace.add({ ts: Date.now(), type: 'tool:start', stepId: step.id, toolName: step.toolName, input: step.input });
                const t0 = Date.now();
                const output = await tool.handler(step.input, { trace, env, logger: console, vars });
                vars[step.id] = output;
                if (step.assign)
                    vars[step.assign] = output;
                trace.add({ ts: Date.now(), type: 'tool:end', stepId: step.id, toolName: step.toolName, output, durationMs: Date.now() - t0 });
            }
        }
        trace.add({ ts: Date.now(), type: 'plan:end', planId: plan.id, ok: true });
    }
    catch (err) {
        trace.add({ ts: Date.now(), type: 'error', message: String(err?.message || err), stack: err?.stack });
        throw err;
    }
    return { vars, trace };
}
export async function replayPlan(plan, traceJson) {
    // MVP: inject tool outputs by matching stepId entries
    const vars = {};
    for (const e of traceJson.events)
        if (e.type === 'tool:end' && e.stepId)
            vars[e.stepId] = e.output;
    return { vars };
}
export { createTrace } from './trace.js';
//# sourceMappingURL=index.js.map