import { registerTool, runPlan, createTrace } from '@seqthink/runtime'

// TODO: import real tool impls; for now register a placeholder
registerTool({ name: 'run_model', async handler(){ return { series:{ t:[0], y:{A:[0]} } } } })

async function main(){
  console.log('[or-server] ready (stub)')
  // noop server; this is an MCP server in the real impl
}

if (import.meta.url === `file://${process.argv[1]}`) main()