export interface TemplateManifest {
  id: string;
  version: string;
  title: string;
  description: string;
  files: string[];
  demos: Array<{ id: string; title: string; planPath: string; outDir: string }>;
  acceptance: string[];
}

export const manifest: TemplateManifest = {
  id: 'or-server',
  version: '0.1.0',
  title: 'Operational Reasoning Server',
  description: 'Template OR server with Python worker and demos',
  files: [
    'files/README.md'
  ],
  demos: [
    { id: 'default', title: 'Default Demo', planPath: 'plans/demo.plan.yaml', outDir: 'demos/default/out' }
  ],
  acceptance: [ 'tests/acceptance/*.test.ts' ]
};