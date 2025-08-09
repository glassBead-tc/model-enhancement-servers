export interface TokenUsage { prompt: number; completion: number }
export interface BridgeConfig { provider: 'openai'|'anthropic'|'lindy'|'local'; apiKey?: string; model?: string; baseUrl?: string }
export interface Bridge {
  complete(prompt: string, sys?: string, opts?: { stop?: string[]; maxTokens?: number }): Promise<{ text: string; usage?: TokenUsage }>
}

export function createBridge(cfg: BridgeConfig): Bridge {
  // MVP: support only local stub unless provider is explicitly 'local'
  return {
    async complete(prompt: string) {
      // local echo stub; in real adapters, call provider
      return { text: prompt };
    }
  };
}