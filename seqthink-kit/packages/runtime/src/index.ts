// @seqthink/runtime — core types + minimal loop stub

export type StepKind = 'think' | 'tool';

export interface ThoughtStepBase { id: string; kind: StepKind }
export interface ThinkStep extends ThoughtStepBase { kind: 'think'; prompt: string; system?: string; stop?: string[] }
export interface ToolStep extends ThoughtStepBase { kind: 'tool'; toolName: string; input: unknown; assign?: string }
export type ThoughtStep = ThinkStep | ToolStep;

export interface ThoughtPlan { id: string; steps: ThoughtStep[]; metadata?: Record<string, any> }

export interface TokenUsage { prompt: number; completion: number }

export interface TraceEvent {
  ts: number;
  type: 'plan:start'|'plan:end'|'think:start'|'think:end'|'tool:start'|'tool:end'|'error';
  planId?: string; stepId?: string; toolName?: string; input?: any; output?: any; prompt?: string; usage?: TokenUsage; durationMs?: number; message?: string; stack?: string;
}
export interface TraceJSON { version: 1; events: TraceEvent[] }

export interface Trace { add(e: TraceEvent): void; toJSON(): TraceJSON; persist(path: string): Promise<void> }

export interface ToolContext {
  trace: Trace;
  env: Record<string, string | undefined>;
  logger: Pick<Console, 'log'|'error'|'warn'|'info'>;
  vars: Record<string, any>;
  signal?: AbortSignal;
}

export interface ToolRegistration<I = any, O = any> { name: string; inputSchema?: object; outputSchema?: object; handler: (input: I, ctx: ToolContext) => Promise<O> }

const _tools: Map<string, ToolRegistration> = new Map();
export function registerTool(reg: ToolRegistration) { _tools.set(reg.name, reg) }
export function getRegisteredTools() { return Array.from(_tools.values()) }

export interface ThinkProvider { complete(prompt: string, sys?: string, opts?: { stop?: string[]; maxTokens?: number }): Promise<{ text: string; usage?: TokenUsage }> }

export interface RuntimeOptions { maxStepMs?: number; retries?: number; onTokenUsage?: (u: TokenUsage)=>void; env?: Record<string,string|undefined>; thinkProvider?: ThinkProvider }

import { createTrace } from './trace.js'

export async function runPlan(plan: ThoughtPlan, opts: RuntimeOptions = {}): Promise<{ vars: Record<string, any>; trace: Trace }>{
  const trace = createTrace();
  const vars: Record<string, any> = {};
  const env = opts.env ?? process.env;
  trace.add({ ts: Date.now(), type: 'plan:start', planId: plan.id });
  try {
    for (const step of plan.steps) {
      if (step.kind === 'think') {
        trace.add({ ts: Date.now(), type: 'think:start', stepId: step.id, prompt: step.prompt });
        const tp = opts.thinkProvider;
        const text = tp ? (await tp.complete(step.prompt, (step as any).system, { stop: step.stop })).text : '[stub: think output]';
        vars[step.id] = text;
        trace.add({ ts: Date.now(), type: 'think:end', stepId: step.id, output: text });
      } else {
        const tool = _tools.get(step.toolName);
        if (!tool) throw new Error(`Tool not registered: ${step.toolName}`);
        trace.add({ ts: Date.now(), type: 'tool:start', stepId: step.id, toolName: step.toolName, input: (step as ToolStep).input });
        const t0 = Date.now();
        const output = await tool.handler((step as ToolStep).input, { trace, env, logger: console, vars });
        vars[step.id] = output;
        if ((step as ToolStep).assign) vars[(step as ToolStep).assign!] = output;
        trace.add({ ts: Date.now(), type: 'tool:end', stepId: step.id, toolName: step.toolName, output, durationMs: Date.now()-t0 });
      }
    }
    trace.add({ ts: Date.now(), type: 'plan:end', planId: plan.id, ok: true } as any);
  } catch (err: any) {
    trace.add({ ts: Date.now(), type: 'error', message: String(err?.message||err), stack: err?.stack });
    throw err;
  }
  return { vars, trace };
}

export async function replayPlan(plan: ThoughtPlan, traceJson: TraceJSON): Promise<{ vars: Record<string, any> }>{
  // MVP: inject tool outputs by matching stepId entries
  const vars: Record<string, any> = {};
  for (const e of traceJson.events) if (e.type === 'tool:end' && e.stepId) vars[e.stepId] = e.output;
  return { vars };
}

export { createTrace } from './trace.js'