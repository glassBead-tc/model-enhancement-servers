#!/usr/bin/env node
import { Command } from 'commander'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execa } from 'execa'

const program = new Command()
program
  .name('seqthink')
  .description('Sequentialthinking++ Kit CLI')
  .version('0.1.0')

program
  .command('new')
  .argument('<template>', 'template id, e.g. or')
  .argument('<name>', 'target dir name')
  .option('--no-install', 'skip install')
  .action(async (template, name, opts) => {
    const root = process.cwd()
    const target = path.join(root, name)
    await fs.mkdir(target, { recursive: true })
    // naive copy from template package for MVP
    const pkgRoot = path.join(root, 'packages', `template-${template}`, 'files')
    await copyDir(pkgRoot, target)
    if (opts.install) {
      try { await execa('pnpm', ['install'], { cwd: target, stdio: 'inherit' }) } catch {}
    }
    console.log(`[seqthink] scaffolded ${template} into ${name}`)
  })

program
  .command('demo')
  .argument('[id]', 'demo id, default: first in template manifest')
  .action(async () => {
    console.log('[seqthink] demo (stub) — call template runner in v0.2')
  })

program
  .command('share')
  .option('--dir <dir>', 'output directory', './public')
  .action(async (opts) => {
    await fs.mkdir(opts.dir, { recursive: true })
    await fs.writeFile(path.join(opts.dir, 'index.html'), `<!doctype html><meta charset=utf-8><title>seqthink demo</title><h1>Demo</h1><p>Share stub</p>`)
    console.log(`[seqthink] wrote ${opts.dir}/index.html`)
  })

program.parseAsync()

async function copyDir(from: string, to: string) {
  const entries = await fs.readdir(from, { withFileTypes: true })
  for (const e of entries) {
    const src = path.join(from, e.name)
    const dst = path.join(to, e.name)
    if (e.isDirectory()) { await fs.mkdir(dst, { recursive: true }); await copyDir(src, dst) }
    else { await fs.copyFile(src, dst) }
  }
}