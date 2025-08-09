export type StepKind = 'think' | 'tool';

export interface ThoughtStepBase { id: string; kind: StepKind; }

export interface ThinkStep extends ThoughtStepBase {
  kind: 'think';
  prompt: string;
  system?: string;
  stop?: string[];
}

export interface ToolStep extends ThoughtStepBase {
  kind: 'tool';
  toolName: string;
  input: unknown;
  assign?: string;
}

export type ThoughtStep = ThinkStep | ToolStep;

export interface ThoughtPlan { id: string; steps: ThoughtStep[]; metadata?: Record<string, any>; }

export interface TokenUsage { prompt: number; completion: number; }

export type TraceEvent =
  | { ts: number; type: 'plan:start'; planId: string }
  | { ts: number; type: 'plan:end'; planId: string; ok: boolean }
  | { ts: number; type: 'think:start'; stepId: string; prompt: string }
  | { ts: number; type: 'think:end'; stepId: string; output: string; usage?: TokenUsage }
  | { ts: number; type: 'tool:start'; stepId: string; toolName: string; input: any }
  | { ts: number; type: 'tool:end'; stepId: string; toolName: string; output: any; durationMs: number }
  | { ts: number; type: 'error'; stepId?: string; message: string; stack?: string };

export interface TraceJSON { events: TraceEvent[]; version: 1 }

export interface Trace {
  add: (e: TraceEvent) => void;
  toJSON: () => TraceJSON;
  persist: (path: string) => Promise<void>;
}

export interface ToolContext {
  trace: Trace;
  env: Record<string, string | undefined>;
  logger: Pick<Console, 'log' | 'error' | 'warn' | 'info'>;
  vars: Record<string, any>;
  signal?: AbortSignal;
}

export interface ToolRegistration<I = any, O = any> {
  name: string;
  inputSchema?: object;
  outputSchema?: object;
  handler: (input: I, ctx: ToolContext) => Promise<O>;
}

export interface RuntimeOptions {
  maxStepMs?: number;
  retries?: number;
  onTokenUsage?: (u: TokenUsage) => void;
}

export type Redactor = (e: TraceEvent) => TraceEvent;

import { promises as fs } from 'node:fs';
import path from 'node:path';

class InMemoryTrace implements Trace {
  private events: TraceEvent[] = [];
  constructor(private redactor?: Redactor) {}
  add(e: TraceEvent) {
    this.events.push(this.redactor ? this.redactor(e) : e);
  }
  toJSON(): TraceJSON {
    return { events: this.events, version: 1 } as const;
  }
  async persist(p: string) {
    const dir = path.dirname(p);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(p, JSON.stringify(this.toJSON(), null, 2), 'utf8');
  }
}

export function createTrace(redact?: Redactor): Trace {
  return new InMemoryTrace(redact);
}

const registry = new Map<string, ToolRegistration<any, any>>();

export function registerTool(reg: ToolRegistration): void {
  registry.set(reg.name, reg);
}

export function getRegisteredTools(): ToolRegistration[] {
  return Array.from(registry.values());
}

// Bridge interface placeholder; actual implementation is in @seqthink/bridges
export interface BridgeCompleteResult { text: string; usage?: TokenUsage }
export interface Bridge { complete: (prompt: string, sys?: string, opts?: { stop?: string[]; maxTokens?: number }) => Promise<BridgeCompleteResult>; }

export async function runPlan(
  plan: ThoughtPlan,
  opts: RuntimeOptions & { env?: Record<string, string>; bridge?: Bridge } = {}
): Promise<{ vars: Record<string, any>; trace: Trace }> {
  const { maxStepMs = 120000, retries = 0, onTokenUsage, env = process.env as Record<string, string>, bridge } = opts;
  const trace = createTrace();
  const vars: Record<string, any> = {};
  trace.add({ ts: Date.now(), type: 'plan:start', planId: plan.id });

  const logger = console;

  for (const step of plan.steps) {
    if (step.kind === 'think') {
      const think = step as ThinkStep;
      trace.add({ ts: Date.now(), type: 'think:start', stepId: step.id, prompt: think.prompt });
      const runOnce = async () => {
        if (!bridge) throw new Error('No bridge provided for think step');
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), maxStepMs);
        try {
          const res = await bridge.complete(think.prompt, think.system, { stop: think.stop });
          const text = res.text ?? '';
          vars[step.id] = text;
          if (onTokenUsage && res.usage) onTokenUsage(res.usage);
          trace.add({ ts: Date.now(), type: 'think:end', stepId: step.id, output: text, usage: res.usage });
        } finally {
          clearTimeout(timeout);
        }
      };
      await retryWithBackoff(runOnce, retries, (err) => trace.add({ ts: Date.now(), type: 'error', stepId: step.id, message: String(err?.message ?? err), stack: (err as any)?.stack }));
    } else if (step.kind === 'tool') {
      const tool = step as ToolStep;
      const registration = registry.get(tool.toolName);
      if (!registration) {
        const message = `Tool not registered: ${tool.toolName}`;
        trace.add({ ts: Date.now(), type: 'error', stepId: step.id, message });
        throw new Error(message);
      }
      trace.add({ ts: Date.now(), type: 'tool:start', stepId: step.id, toolName: registration.name, input: tool.input });
      const started = Date.now();
      const runOnce = async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), maxStepMs);
        try {
          const output = await registration.handler(tool.input, { trace, env, logger, vars, signal: controller.signal });
          vars[step.id] = output;
          if (tool.assign) vars[tool.assign] = output;
          const durationMs = Date.now() - started;
          trace.add({ ts: Date.now(), type: 'tool:end', stepId: step.id, toolName: registration.name, output, durationMs });
        } finally {
          clearTimeout(timeout);
        }
      };
      await retryWithBackoff(runOnce, retries, (err) => trace.add({ ts: Date.now(), type: 'error', stepId: step.id, message: String(err?.message ?? err), stack: (err as any)?.stack }));
    }
  }

  trace.add({ ts: Date.now(), type: 'plan:end', planId: plan.id, ok: true });
  return { vars, trace };
}

async function retryWithBackoff(fn: () => Promise<void>, retries: number, onError: (err: any) => void) {
  let attempt = 0;
  while (true) {
    try {
      await fn();
      return;
    } catch (err) {
      onError(err);
      if (attempt >= retries) throw err;
      const delayMs = Math.pow(2, attempt) * 1000;
      await new Promise((res) => setTimeout(res, delayMs));
      attempt += 1;
    }
  }
}

export async function replayPlan(plan: ThoughtPlan, prior: TraceJSON): Promise<{ vars: Record<string, any> }> {
  const vars: Record<string, any> = {};
  for (const step of plan.steps) {
    if (step.kind === 'think') {
      const end = prior.events.find((e) => e.type === 'think:end' && e.stepId === step.id) as any;
      if (!end) throw new Error(`Missing think:end for step ${step.id}`);
      vars[step.id] = end.output;
    } else {
      const end = prior.events.find((e) => e.type === 'tool:end' && e.stepId === step.id) as any;
      if (!end) throw new Error(`Missing tool:end for step ${step.id}`);
      vars[step.id] = end.output;
      const assign = (step as ToolStep).assign;
      if (assign) vars[assign] = end.output;
    }
  }
  return { vars };
}