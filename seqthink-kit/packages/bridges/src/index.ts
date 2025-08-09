export interface TokenUsage { prompt: number; completion: number }

export interface BridgeConfig { provider: 'openai'|'anthropic'|'lindy'|'stub'; apiKey?: string; model?: string; baseUrl?: string }
export interface Bridge { complete(prompt: string, sys?: string, opts?: { stop?: string[]; maxTokens?: number }): Promise<{ text: string; usage?: TokenUsage }> }

export function createBridge(cfg: BridgeConfig): Bridge {
  if (cfg.provider === 'stub') return { async complete(prompt){ return { text: `stub: ${prompt}`, usage: { prompt: 0, completion: 0 } } } }
  // TODO: implement real providers in v0.2
  return { async complete(prompt){ return { text: `unconfigured: ${prompt}`, usage: { prompt: 0, completion: 0 } } } }
}