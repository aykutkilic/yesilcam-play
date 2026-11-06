#!/usr/bin/env node
// Yeşilçam Studio bridge: lets the studio in your browser use Claude Code or Codex on THIS computer as its AI
// director. It listens on http://localhost:5199 (only on the loopback interface) and, for each request from the
// studio, runs your agent once in print mode with the director's prompt, returning its text.
//
//   node yesilcam-bridge.mjs            (needs `claude` and/or `codex` on your PATH, logged in)
//   PORT=5200 node yesilcam-bridge.mjs
//
// No dependencies. Only requests from the studio's own pages are accepted (CORS origin check).

import http from 'node:http';
import { spawn } from 'node:child_process';

const PORT = +(process.env.PORT || 5199);
const ALLOWED = [/^https:\/\/aykutkilic\.github\.io$/, /^http:\/\/localhost(:\d+)?$/, /^http:\/\/127\.0\.0\.1(:\d+)?$/];
const TIMEOUT = 300_000;

const AGENTS = {
  claude: (prompt) => ['claude', ['-p', '--output-format', 'text'], prompt],
  codex: (prompt) => ['codex', ['exec', '--skip-git-repo-check', '-'], prompt],
};

function run(agent, prompt) {
  return new Promise((resolve, reject) => {
    const def = AGENTS[agent];
    if (!def) return reject(new Error(`unknown agent ${agent}`));
    const [cmd, args, input] = def(prompt);
    const p = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'], shell: process.platform === 'win32' });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      p.kill();
      reject(new Error('the agent took too long'));
    }, TIMEOUT);
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('error', (e) => {
      clearTimeout(timer);
      reject(new Error(`could not start ${cmd}: ${e.message}`));
    });
    p.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0 && out.trim()) resolve(out);
      else reject(new Error(`${cmd} exited with ${code}: ${(err || out).slice(-600)}`));
    });
    p.stdin.end(input);
  });
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin || '';
  const ok = ALLOWED.some((r) => r.test(origin));
  if (ok) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
  }
  if (req.method === 'OPTIONS') return res.writeHead(ok ? 204 : 403).end();
  if (!ok) return res.writeHead(403).end('origin not allowed');
  if (req.method === 'GET') return res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ok: true, agents: Object.keys(AGENTS) }));
  if (req.method !== 'POST' || req.url !== '/run') return res.writeHead(404).end();
  let body = '';
  req.on('data', (d) => {
    body += d;
    if (body.length > 2e6) req.destroy();
  });
  req.on('end', async () => {
    try {
      const { agent = 'claude', prompt } = JSON.parse(body);
      if (typeof prompt !== 'string' || !prompt) throw new Error('no prompt');
      console.log(`[bridge] ${agent}: directing (${prompt.length} chars)…`);
      const text = await run(agent, prompt);
      console.log(`[bridge] ${agent}: done (${text.length} chars)`);
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ text }));
    } catch (e) {
      console.log(`[bridge] error: ${e.message}`);
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: e.message }));
    }
  });
});

server.listen(PORT, '127.0.0.1', () => console.log(`Yeşilçam bridge on http://localhost:${PORT} — set "Claude Code / Codex on this computer" in the studio's settings.`));
