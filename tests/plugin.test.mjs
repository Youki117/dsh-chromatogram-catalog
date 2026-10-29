import test from 'node:test';
import assert from 'node:assert/strict';
import { startPlugin } from '../index.js';
import { isNewer, versionParts, readRelease, releaseAsset } from '../lib/releases.js';

const repository = 'Youki117/dsh-chromatogram-catalog';
const release = version => ({ tag_name: `v${version}`, body: '修复导出及中文路径', draft: false, prerelease: false,
  assets: [{ name: `dsh-chromatogram-catalog-${version}.tgz`, browser_download_url: `https://github.com/${repository}/releases/download/v${version}/dsh-chromatogram-catalog-${version}.tgz` }] });
const engine = busy => ({ phase: '本地服务运行中', ensure: async () => 'http://127.0.0.1:12345/test/', busy: async () => busy, dispose() {} });

test('正式版本按数字比较，拒绝预览版和损坏版本', () => {
  assert.equal(isNewer('v0.10.0', '0.9.9'), true);
  assert.equal(isNewer('0.1.0', '0.1.0'), false);
  assert.equal(isNewer('0.0.9', '0.1.0'), false);
  for (const value of ['0.2.0-beta', 'latest', '1.2', '01.2.3', '1.2.9007199254740992']) assert.throws(() => versionParts(value));
});

test('只接受指定 GitHub 仓库、正式版本和精确发布文件', () => {
  const good = release('0.2.0');
  assert.ok(releaseAsset(good, repository, 'dsh-chromatogram-catalog-0.2.0.tgz'));
  good.assets[0].browser_download_url = 'https://example.com/evil.tgz';
  assert.throws(() => releaseAsset(good, repository, good.assets[0].name));
  assert.throws(() => releaseAsset({ ...release('0.2.0'), prerelease: true }, repository, 'x'));
});

test('GitHub 不可用时给出可读错误', async () => {
  await assert.rejects(readRelease(repository, 'latest', async () => new Response('', { status: 429 })), /限制请求/);
  await assert.rejects(readRelease(repository, 'latest', async () => new Response('', { status: 404 })), /尚无/);
});

test('每次插件启动都会检查；发现新版后由用户确认入口安装', async t => {
  let checks = 0, installed;
  const plugin = await startPlugin({ engine: engine(false), fetcher: async () => { checks++; return Response.json(release('0.2.0')); },
    install: async url => { installed = url; return { changed: true, application: 'restart-required' }; } });
  t.after(() => plugin.dispose());
  await plugin.check();
  assert.equal(checks, 1);
  assert.equal(plugin.state.available.version, '0.2.0');
  assert.equal(installed, undefined);
  const unauthorized = await fetch(new URL('/status', plugin.url));
  assert.equal(unauthorized.status, 404);
  const response = await fetch(plugin.url + 'update', { method: 'POST' });
  assert.equal(response.status, 200);
  assert.equal(installed, release('0.2.0').assets[0].browser_download_url);
  assert.match((await response.json()).message, /重启 DSH/);
  await plugin.check();
  assert.equal(checks, 2);
});

test('网络失败不阻止打开本地工作台', async t => {
  const plugin = await startPlugin({ engine: engine(false), fetcher: async () => { throw new Error('离线'); }, install: async () => { throw new Error('不应安装'); } });
  t.after(() => plugin.dispose());
  await plugin.check();
  assert.equal(plugin.state.available, null);
  assert.equal(plugin.state.checkError, '离线');
  const response = await fetch(plugin.url + 'workbench', { method: 'POST' });
  assert.equal(response.status, 200);
  assert.match((await response.json()).url, /^http:\/\/127\.0\.0\.1/);
});

test('忙碌任务与安装失败均不会报告更新成功', async t => {
  for (const busy of [true, false]) {
    let called = false;
    const plugin = await startPlugin({ engine: engine(busy), fetcher: async () => Response.json(release('0.2.0')),
      install: async () => { called = true; return { changed: false, application: 'failed', error: { message: '下载失败' } }; } });
    t.after(() => plugin.dispose());
    await plugin.check();
    const response = await fetch(plugin.url + 'update', { method: 'POST' });
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, busy ? /仍在处理/ : /下载失败/);
    assert.equal(called, !busy);
    assert.equal(plugin.state.updating, false);
    assert.equal(plugin.state.version, '0.1.0');
  }
});
