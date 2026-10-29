import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export function versionParts(value) {
  const match = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(value ?? '');
  if (!match) throw new Error('版本号必须是正式版本，例如 0.1.0');
  const parts = match.slice(1).map(Number);
  if (!parts.every(Number.isSafeInteger)) throw new Error('版本号超出范围');
  return parts;
}

export function isNewer(remote, current) {
  const a = versionParts(remote), b = versionParts(current);
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}

export function releaseAsset(release, repository, name) {
  if (!release || release.draft || release.prerelease) throw new Error('不是可用的正式发布版本');
  versionParts(release.tag_name);
  const asset = release.assets?.find(item => item.name === name);
  const prefix = `https://github.com/${repository}/releases/download/${release.tag_name}/`;
  if (!asset || asset.browser_download_url !== prefix + encodeURIComponent(name)) {
    throw new Error(`GitHub 发布缺少有效文件：${name}`);
  }
  return asset;
}

export async function readRelease(repository, tag = 'latest', fetcher = fetch) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new Error('GitHub 仓库名称不合法');
  const path = tag === 'latest' ? 'latest' : `tags/${encodeURIComponent(tag)}`;
  const response = await fetcher(`https://api.github.com/repos/${repository}/releases/${path}`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'dsh-chromatogram-catalog' },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) {
    if (response.status === 404) throw new Error('GitHub 尚无可访问的发布版本');
    if (response.status === 403 || response.status === 429) throw new Error('GitHub 暂时限制请求，请稍后重试');
    throw new Error(`GitHub 检查失败（HTTP ${response.status}）`);
  }
  const release = await response.json();
  if (release.draft || release.prerelease) throw new Error('GitHub 未返回正式发布版本');
  versionParts(release.tag_name);
  return release;
}

export async function downloadAsset(asset, destination) {
  const response = await fetch(asset.browser_download_url, { signal: AbortSignal.timeout(300000) });
  if (!response.ok || !response.body) throw new Error(`下载失败（HTTP ${response.status}）`);
  const hash = createHash('sha256');
  let bytes = 0;
  await pipeline(Readable.fromWeb(response.body), new Transform({
    transform(chunk, encoding, done) {
      bytes += chunk.length;
      if (bytes > 600 * 1024 * 1024) return done(new Error('发布文件超过大小限制'));
      hash.update(chunk);
      done(null, chunk);
    },
  }), createWriteStream(destination, { flags: 'wx' }));
  if (Number.isFinite(asset.size) && bytes !== asset.size) throw new Error('下载不完整，请重试');
  // GitHub 的发布文件摘要用于校验将要执行的程序下载。
  const actual = `sha256:${hash.digest('hex')}`;
  if (asset.digest && asset.digest !== actual) throw new Error('下载文件与 GitHub 发布摘要不一致');
}
