import { spawn, execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { readRelease, releaseAsset, downloadAsset } from './releases.js';

const exec = promisify(execFile);

export class Engine {
  constructor({ directory, repository, version }) {
    this.directory = directory;
    this.repository = repository;
    this.version = version;
    this.phase = '尚未启动';
    this.child = null;
    this.url = null;
    this.pending = null;
    this.disposed = false;
  }

  async ensure() {
    if (this.disposed) throw new Error('插件已关闭，请重启 DSH');
    if (this.url) return this.url;
    if (!this.pending) this.pending = this.start().catch(error => {
      this.phase = `启动失败：${error.message}`;
      throw error;
    }).finally(() => { this.pending = null; });
    return this.pending;
  }

  async start() {
    if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('当前图谱处理运行时支持 Windows x64');
    const folder = join(this.directory, `engine-${this.version}`);
    const executable = join(folder, 'catalog-engine.exe');
    if (!existsSync(executable)) {
      this.phase = '正在下载首次运行所需的识别组件…';
      await mkdir(this.directory, { recursive: true });
      const release = await readRelease(this.repository, `v${this.version}`);
      const asset = releaseAsset(release, this.repository, `catalog-engine-win32-x64-${this.version}.zip`);
      const work = join(this.directory, `.download-${randomBytes(6).toString('hex')}`);
      await mkdir(work);
      try {
        const archive = join(work, 'engine.zip');
        const stage = join(work, 'unpacked');
        await downloadAsset(asset, archive, (bytes, total) => {
          this.phase = `正在下载识别组件：${(bytes / 1048576).toFixed(0)} / ${(total / 1048576).toFixed(0)} MB`;
        });
        this.phase = '正在解压识别组件…';
        await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
          '$ErrorActionPreference = "Stop"; Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::ExtractToDirectory($env:DSH_CATALOG_ARCHIVE, $env:DSH_CATALOG_STAGE)'],
        { windowsHide: true, timeout: 300000, env: { ...process.env, DSH_CATALOG_ARCHIVE: archive, DSH_CATALOG_STAGE: stage } });
        if (!existsSync(join(stage, 'catalog-engine.exe')) || !existsSync(join(stage, '程序', 'ui', 'main.pyc'))) {
          throw new Error('识别组件不完整，未安装');
        }
        if (this.disposed) throw new Error('插件已关闭');
        await rename(stage, folder);
      } finally {
        await rm(work, { recursive: true, force: true });
      }
    }
    if (this.disposed) throw new Error('插件已关闭');
    this.phase = '正在启动本地图谱工作台…';
    const ready = join(this.directory, `.ready-${randomBytes(6).toString('hex')}.json`);
    const token = randomBytes(24).toString('hex');
    // 旧运行时的入口查找「程序/」；构建阶段已使用这个目录名。
    this.child = spawn(executable, [], {
      cwd: folder, windowsHide: true, stdio: 'ignore',
      env: { ...process.env, DSH_CATALOG_READY_FILE: ready, DSH_CATALOG_TOKEN: token },
    });
    let failure;
    this.child.on('error', error => { failure = error; });
    this.child.once('exit', () => { this.url = null; this.phase = '本地图谱服务已停止，可重新打开'; });
    try {
      const deadline = Date.now() + 45000;
      while (Date.now() < deadline) {
        if (this.disposed) throw new Error('插件已关闭');
        if (failure) throw failure;
        if (this.child.exitCode !== null) throw new Error('图谱服务未能启动，请查看本地运行日志');
        try {
          const info = JSON.parse(await readFile(ready, 'utf8'));
          if (Number.isInteger(info.port) && info.port > 0 && info.port <= 65535) {
            const url = `http://127.0.0.1:${info.port}/${token}/`;
            const result = await fetch(url + 'health', { signal: AbortSignal.timeout(3000) });
            if (result.ok) { this.url = url; this.phase = '本地服务运行中'; return url; }
          }
        } catch (error) {
          if (error.code !== 'ENOENT' && !(error instanceof TypeError)) throw error;
        }
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      throw new Error('图谱服务启动超时，请重试');
    } catch (error) {
      this.child.kill();
      this.url = null;
      this.phase = error.message;
      throw error;
    } finally {
      await rm(ready, { force: true });
    }
  }

  async busy() {
    if (!this.url) return Boolean(this.pending);
    const response = await fetch(this.url + 'health', { signal: AbortSignal.timeout(3000) });
    if (!response.ok) throw new Error('不能确认图谱任务状态，请稍后再更新');
    return Boolean((await response.json()).busy);
  }

  dispose() {
    this.disposed = true;
    this.child?.kill();
    this.url = null;
  }
}
