// Template manifest for OR server — minimal to get CLI 'new' working
export interface TemplateManifest {
  id: string; version: string; title: string; description: string;
  files: string[]; demos: Array<{ id: string; title: string; planPath: string; outDir: string }>; acceptance: string[];
}

export const manifest: TemplateManifest = {
  id: 'or',
  version: '0.1.0',
  title: 'Operational Reasoning MCP Server',
  description: 'System dynamics + OR server template for seqthink kit',
  files: [
    'README.md', 'package.json', 'tsconfig.json',
    'src/server.ts', 'src/tools/index.ts', 'src/observability/trace.ts',
    'plans/bass.plan.yaml', 'demos/bass/memo.template.md',
    'python/worker/main.py', 'python/worker/models/bass_diffusion.py',
    'tests/acceptance/T01_first_win.test.ts'
  ],
  demos: [{ id: 'bass', title: 'Bass diffusion', planPath: 'plans/bass.plan.yaml', outDir: 'demos/bass/out' }],
  acceptance: ['tests/acceptance/*.test.ts']
}