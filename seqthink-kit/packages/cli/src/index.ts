#!/usr/bin/env node
import { Command } from 'commander';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bold, green, yellow } from 'kleur/colors';

const program = new Command();
program.name('seqthink').description('Sequentialthinking++ Kit CLI').version('0.1.0');

program
  .command('new')
  .argument('<template>', 'template id (e.g., or-server)')
  .argument('<name>', 'target folder name')
  .option('--no-install', 'skip installing dependencies')
  .option('--pm <pm>', 'package manager', 'pnpm')
  .option('--git-init', 'initialize git repo')
  .action(async (template: string, name: string, opts: any) => {
    console.log(bold(`Scaffold ${template} -> ${name}`));
    // MVP stub: create folder
    const target = path.resolve(process.cwd(), name);
    await fs.mkdir(target, { recursive: true });
    // write placeholder
    await fs.writeFile(path.join(target, 'README.md'), `# ${name}\n\nTemplate: ${template}\n`);
    console.log(green('Done.'));
  });

program
  .command('demo')
  .option('--id <id>', 'demo id')
  .action(async () => {
    console.log(yellow('demo: not implemented in MVP stub'));
  });

program
  .command('share')
  .option('--dir <dir>', 'output dir', './public')
  .option('--gist', 'share as gist')
  .action(async () => {
    console.log(yellow('share: not implemented in MVP stub'));
  });

program.parseAsync();