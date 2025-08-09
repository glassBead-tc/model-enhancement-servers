import * as fs from 'node:fs/promises';
export function createTrace() {
    const events = [];
    return {
        add(e) { events.push(e); },
        toJSON() { return { version: 1, events }; },
        async persist(path) { await fs.mkdir(require('node:path').dirname(path), { recursive: true }); await fs.writeFile(path, JSON.stringify({ version: 1, events }, null, 2)); }
    };
}
//# sourceMappingURL=trace.js.map