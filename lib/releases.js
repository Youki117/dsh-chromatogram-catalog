import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { open, stat, readFile, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

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
  if (asset.url && (!Number.isSafeInteger(asset.id) || asset.id <= 0 ||
      asset.url !== `https://api.github.com/repos/${repository}/releases/assets/${asset.id}`)) {
    throw new Error('GitHub 发布文件 API 地址不合法');
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

export async function downloadAsset(asset, destination, onProgress = () => {}) {
  if (Number.isFinite(asset.size) && asset.size > 600 * 1024 * 1024) throw new Error('发布文件超过大小限制');
  const reserved = await open(destination, 'wx');
  await reserved.close();
  let remote = asset.url || asset.browser_download_url;
  // Windows 自带下载器在大文件传输时比当前网络下的 Node fetch 更稳定。
  const transfer = async (output, extra = [], limit = 600 * 1024 * 1024) => {
    try {
      const result = await exec('curl.exe', ['--fail', '--location', '--silent', '--show-error', '--connect-timeout', '15',
        '--max-time', '90', '--retry', '2', '--retry-delay', '2', '--max-filesize', String(limit),
        '--header', 'Accept: application/octet-stream', ...extra,
        '--write-out', '%{url_effective}', '--output', output, remote], { windowsHide: true, timeout: 320000 });
      // 复用 GitHub 返回的临时下载地址，避免每个分段都占用 API 配额。
      remote = result.stdout.trim() || remote;
    } catch (error) {
      const reasons = { 6: '无法解析 GitHub 下载地址', 7: '无法连接 GitHub 下载服务', 22: 'GitHub 下载服务返回错误', 28: '连接 GitHub 下载服务超时', 63: '发布文件超过大小限制' };
      throw new Error(`${reasons[error.code] || '下载失败'}，请稍后重试`);
    }
  };
  const chunkSize = 8 * 1024 * 1024;
  if (asset.size > chunkSize) {
    const part = destination + '.part', headers = destination + '.headers';
    const output = await open(destination, 'a');
    try {
      for (let start = 0; start < asset.size; start += chunkSize) {
        const end = Math.min(start + chunkSize, asset.size) - 1;
        await transfer(part, ['--range', `${start}-${end}`, '--dump-header', headers], end - start + 1);
        const ranges = [...(await readFile(headers, 'utf8')).matchAll(/^content-range:\s*bytes\s+(\d+)-(\d+)\/(\d+)\s*$/gim)];
        const range = ranges.at(-1)?.slice(1).map(Number);
        const data = await readFile(part);
        if (!range || range[0] !== start || range[1] !== end || range[2] !== asset.size || data.length !== end - start + 1) {
          throw new Error('下载不完整：服务未返回要求的文件分段');
        }
        await output.writeFile(data);
        onProgress(end + 1, asset.size);
      }
    } finally {
      await output.close();
      await rm(part, { force: true });
      await rm(headers, { force: true });
    }
  } else {
    await transfer(destination);
    onProgress((await stat(destination)).size, asset.size);
  }
  const bytes = (await stat(destination)).size;
  if (Number.isFinite(asset.size) && bytes !== asset.size) throw new Error('下载不完整，请重试');
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(destination)) hash.update(chunk);
  // GitHub 的发布文件摘要用于校验将要执行的程序下载。
  const actual = `sha256:${hash.digest('hex')}`;
  if (asset.digest && asset.digest !== actual) throw new Error('下载文件与 GitHub 发布摘要不一致');
}
