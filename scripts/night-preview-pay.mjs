import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';

/** Development-only gateway simulation for the fixed local staff fixture. */
export function nightPreviewPayPlugin({ apiTarget }) {
  return { name: 'local-night-deposit-payment', apply: 'serve', configureServer(server) {
    server.middlewares.use('/__night-preview/deposit-pay', (req, res) => {
      const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
      if (!local || !['http://localhost:3150', 'http://127.0.0.1:3150'].includes(apiTarget) || (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`)) { res.statusCode = 404; res.end(); return; }
      if (req.method !== 'POST' || !req.headers['content-type']?.includes('application/json')) { res.statusCode = 405; res.end(); return; }
      let body = '';
      req.on('data', chunk => { body += chunk; if (body.length > 2048) req.destroy(); });
      req.on('end', () => {
        let id;
        try { id = JSON.parse(body).depositOrderId; } catch { res.statusCode = 400; res.end(); return; }
        if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id || '')) { res.statusCode = 400; res.end(); return; }
        const apiRoot = fileURLToPath(new URL('../../buchuqin-api/', import.meta.url));
        execFile(process.execPath, [path.join(apiRoot, 'scripts/night-preview-confirm.mjs'), id, 'deposit'], { cwd: apiRoot, timeout: 20000 }, error => {
          res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store');
          res.statusCode = error ? 400 : 200;
          res.end(JSON.stringify(error ? { message: '本机押金模拟失败，请核对隔离环境与支付单' } : { localSimulation: true, confirmed: true }));
        });
      });
    });
  } };
}
