import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Engine } from './lib/runtime.js';
import { readRelease, releaseAsset, isNewer } from './lib/releases.js';

const manifest = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
export const name = 'chromatogram-catalog';
export const inject = ['pluginManager'];

export async function startPlugin({ install, directory, fetcher = fetch, engine: providedEngine }) {
  const repository = manifest.catalog.repository;
  const engine = providedEngine ?? new Engine({ directory, repository, version: manifest.catalog.engineVersion });
  const token = randomBytes(24).toString('hex');
  const prefix = `/${token}/`;
  const state = { version: manifest.version, checking: true, available: null, checkError: null, checkedAt: null,
    updating: false, updateMessage: null, repository: `https://github.com/${repository}` };
  let checkPromise;
  const check = () => {
    if (checkPromise) return checkPromise;
    state.checking = true;
    checkPromise = (async () => {
      try {
        const release = await readRelease(repository, 'latest', fetcher);
        const version = release.tag_name.replace(/^v/, '');
        state.available = isNewer(version, manifest.version) ? {
          version, notes: String(release.body ?? '').slice(0, 12000),
          url: releaseAsset(release, repository, `${manifest.name}-${version}.tgz`).browser_download_url,
        } : null;
        state.checkError = null;
      } catch (error) {
        state.available = null;
        state.checkError = error.name === 'TimeoutError' ? 'GitHub 检查超时，可继续使用当前版本' : error.message;
      } finally {
        state.checking = false;
        state.checkedAt = new Date().toISOString();
        checkPromise = null;
      }
    })();
    return checkPromise;
  };
  const server = createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    const reply = (status, value) => {
      response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify(value));
    };
    const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
    if (!pathname.startsWith(prefix)) return reply(404, { error: 'Not found' });
    const route = pathname.slice(prefix.length);
    try {
      if (request.method === 'GET' && route === 'status') return reply(200, { ...state, engine: engine.phase });
      if (request.method === 'POST' && route === 'check') { await check(); return reply(200, { ...state }); }
      if (request.method === 'POST' && route === 'workbench') {
        if (state.updating) throw new Error('正在安装更新，请稍后打开');
        return reply(200, { url: await engine.ensure() });
      }
      if (request.method === 'POST' && route === 'update') {
        if (state.updating) throw new Error('更新正在进行，请稍候');
        if (state.updateMessage) throw new Error('新版已安装，请先重启 DSH');
        if (!state.available) throw new Error('没有可安装的新版本，请先检查更新');
        const target = state.available;
        state.updating = true;
        try {
          if (await engine.busy()) throw new Error('图谱任务仍在处理，请等处理完成后更新');
          const result = await install(target.url);
          if (!['applied', 'restart-required'].includes(result.application) || !result.changed) {
            throw new Error(result.error?.message ?? 'DSH 没有成功安装更新，当前版本继续可用');
          }
          state.updateMessage = '新版已安装，请重启 DSH 后使用';
          state.available = null;
          return reply(200, { ok: true, message: state.updateMessage });
        } finally { state.updating = false; }
      }
      return reply(404, { error: 'Not found' });
    } catch (error) { reply(400, { error: error.message }); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const url = `http://127.0.0.1:${server.address().port}${prefix}`;
  void check();
  return { url, check, state, dispose() { engine.dispose(); server.close(); server.closeAllConnections(); } };
}

export async function apply(ctx) {
  const directory = join(process.env.LOCALAPPDATA || homedir(), 'DSH Chromatogram Catalog');
  const plugin = await startPlugin({ directory, install: url => ctx.pluginManager.installBundle(url, { enabled: true, saveExact: true }) });
  ctx.on('webserver/index-inject', rows => rows.push({ kind: 'global', name: '__DSH_CATALOG__', value: { url: plugin.url } }));
  ctx.effect(() => () => plugin.dispose(), 'chromatogram-catalog: local services');
}
