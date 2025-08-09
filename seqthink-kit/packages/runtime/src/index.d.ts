export type StepKind = 'think' | 'tool';
export interface ThoughtStepBase {
    id: string;
    kind: StepKind;
}
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
export interface ThoughtPlan {
    id: string;
    steps: ThoughtStep[];
    metadata?: Record<string, any>;
}
export interface TokenUsage {
    prompt: number;
    completion: number;
}
export interface TraceEvent {
    ts: number;
    type: 'plan:start' | 'plan:end' | 'think:start' | 'think:end' | 'tool:start' | 'tool:end' | 'error';
    planId?: string;
    stepId?: string;
    toolName?: string;
    input?: any;
    output?: any;
    prompt?: string;
    usage?: TokenUsage;
    durationMs?: number;
    message?: string;
    stack?: string;
}
export interface TraceJSON {
    version: 1;
    events: TraceEvent[];
}
export interface Trace {
    add(e: TraceEvent): void;
    toJSON(): TraceJSON;
    persist(path: string): Promise<void>;
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
export declare function registerTool(reg: ToolRegistration): void;
export declare function getRegisteredTools(): ToolRegistration<any, any>[];
export interface ThinkProvider {
    complete(prompt: string, sys?: string, opts?: {
        stop?: string[];
        maxTokens?: number;
    }): Promise<{
        text: string;
        usage?: TokenUsage;
    }>;
}
export interface RuntimeOptions {
    maxStepMs?: number;
    retries?: number;
    onTokenUsage?: (u: TokenUsage) => void;
    env?: Record<string, string | undefined>;
    thinkProvider?: ThinkProvider;
}
export declare function runPlan(plan: ThoughtPlan, opts?: RuntimeOptions): Promise<{
    vars: Record<string, any>;
    trace: Trace;
}>;
export declare function replayPlan(plan: ThoughtPlan, traceJson: TraceJSON): Promise<{
    vars: Record<string, any>;
}>;
export { createTrace } from './trace.js';
