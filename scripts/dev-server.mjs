// Local preview: serves web/ and answers /api/* with the real agent code
// running on made-up test data (no Qloo key or model needed).
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { makeSession, refine, InputError } from '../worker/src/agent.js';
import { fakeQloo, fakeAsk } from '../worker/test/fakes.js';

const root = new URL('../web/', import.meta.url).pathname;
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' };
const port = Number(process.env.PORT || 3000);

http
  .createServer(async (req, res) => {
    try {
      if (req.url.startsWith('/api/')) {
        let raw = '';
        for await (const chunk of req) raw += chunk;
        const body = JSON.parse(raw || '{}');
        const ctx = { qloo: fakeQloo(), ask: fakeAsk({}), trace: [] };
        await new Promise((r) => setTimeout(r, 1500));
        const card = req.url === '/api/session' ? await makeSession(ctx, body.profile) : await refine(ctx, body.profile, body.card, body.feedback);
        res.writeHead(200, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ card, trace: ctx.trace }));
      }
      const path = normalize(join(root, req.url === '/' ? 'index.html' : req.url.split('?')[0]));
      if (!path.startsWith(root)) throw new Error('outside');
      const file = await readFile(path);
      res.writeHead(200, { 'content-type': types[extname(path)] || 'application/octet-stream' });
      res.end(file);
    } catch (err) {
      const status = err instanceof InputError ? 400 : err.code === 'ENOENT' ? 404 : 500;
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  })
  .listen(port, () => console.log(`http://localhost:${port}`));
