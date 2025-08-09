import * as fs from 'node:fs/promises'
import type { Trace, TraceEvent, TraceJSON } from './index.js'

export function createTrace(): Trace {
  const events: TraceEvent[] = []
  return {
    add(e: TraceEvent) { events.push(e) },
    toJSON(): TraceJSON { return { version: 1, events } },
    async persist(path: string) { await fs.mkdir(require('node:path').dirname(path), { recursive: true }); await fs.writeFile(path, JSON.stringify({ version:1, events }, null, 2)) }
  }
}