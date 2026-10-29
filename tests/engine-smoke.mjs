// 用合成 PDF 检查可分发运行组件，不读取客户资料。
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { Engine } from '../lib/runtime.js';

const directory = resolve(process.argv[2] || '.build');
const work = resolve('.build/smoke');
await mkdir(work, { recursive: true });
process.env.LOCALAPPDATA = join(work, 'data');
process.env.FC_CACHE_DIR = join(work, 'cache');
const stream = 'BT /F1 16 Tf 40 740 Td (Sample Name: DEMO-SYX) Tj 0 -30 Td (Method: HL) Tj ET\n40 100 m 100 100 l 160 200 l 180 100 l 400 100 l S';
const objects = [
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
  `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
];
let pdf = '%PDF-1.4\n', offsets = [0];
for (const [i, object] of objects.entries()) { offsets.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${object}\nendobj\n`; }
const xref = Buffer.byteLength(pdf);
pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n => String(n).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
const input = join(work, '合成图谱.pdf');
await writeFile(input, pdf);
const engine = new Engine({ directory, repository: 'Youki117/dsh-chromatogram-catalog', version: '0.1.0' });
try {
  const base = await engine.ensure();
  const call = async (name, ...args) => {
    const response = await fetch(base + 'api/' + name, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
    const value = await response.json();
    assert.equal(response.ok, true, value.error);
    assert.equal(value.error, undefined, value.error);
    return value;
  };
  const state = await call('new_job', 'DSH 插件合成测试', '示例品种', '0月');
  await call('add_paths', [input]);
  let pages;
  const until = Date.now() + 90000;
  while (Date.now() < until) {
    const current = await call('state');
    const file = current.files?.[0];
    if (file?.status === '完成') { pages = await call('pages', file.id); break; }
    if (file?.status === '失败') throw new Error('合成 PDF 读取失败');
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.ok(pages, 'OCR 超时');
  const current = await call('state');
  const fid = current.files[0].id;
  await call('add_entry', fid, 1, { name: '合成图谱人工条目', condition: '0月', item: '含量' });
  const catalog = await call('catalog');
  assert.equal(catalog.rows[0].name, '合成图谱人工条目');
  await call('copy_entry', catalog.rows[0].id, { name: '合成图谱副本', condition: '加速3月', item: '含量' });
  const copied = await call('catalog');
  assert.equal(copied.rows.length, 2);
  await call('close_job');
  await call('open_job', state.job.dir);
  const wait = Date.now() + 30000;
  while ((await fetch(base + 'health').then(r => r.json())).busy && Date.now() < wait) await new Promise(resolve => setTimeout(resolve, 200));
  assert.equal((await call('catalog')).rows.length, 2);
  assert.ok(await call('preview', fid, 1));
  console.log(JSON.stringify({ passed: true, importedPages: 1, catalogEntries: 2, persistedAfterReopen: true, preview: true }));
} finally { engine.dispose(); }
