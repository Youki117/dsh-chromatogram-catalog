"""复用已有 Windows 运行时，封装最新业务模块；不收录客户资料和开发语料。"""
from __future__ import annotations

import argparse
import json
import py_compile
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path


def build(source: Path, runtime: Path, compiler: Path, sanitized: Path):
    root = Path(__file__).resolve().parents[1]
    version = json.loads((root / "package.json").read_text("utf-8"))["catalog"]["engineVersion"]
    stage = root / ".build" / f"engine-{version}"
    if stage.exists():
        raise RuntimeError(f"构建目录已存在，请先移走：{stage}")
    stage.mkdir(parents=True)
    executable = runtime / "典型图谱整理.exe"
    if not executable.is_file() or not (runtime / "_internal" / "python311.dll").is_file():
        raise RuntimeError("需要已有 Python 3.11 的 Windows 完整运行时")
    shutil.copy2(executable, stage / "catalog-engine.exe")
    shutil.copytree(runtime / "_internal", stage / "_internal", ignore=shutil.ignore_patterns("程序默认", "__pycache__"))
    program = stage / "程序"
    for package in ("fc", "job", "ui", "rules"):
        shutil.copytree(source / package, program / package,
                        ignore=shutil.ignore_patterns("__pycache__", "*.pyc", "*.bak", "assets", "README.md", "使用说明.txt", "changelog.md"))
    for name in ("corpus", "cli", "validate", "evaluate", "catalog_eval", "trace", "conditions"):
        (program / "fc" / f"{name}.py").unlink(missing_ok=True)
    for name in ("devserver", "shortcut", "background"):
        (program / "ui" / f"{name}.py").unlink(missing_ok=True)
    shutil.copy2(root / "engine" / "main.py", program / "ui" / "main.py")
    shutil.copy2(sanitized / "rules" / "目录模板.docx", program / "rules" / "目录模板.docx")
    # 规则使用现有脱敏快照中的同版配置，避免把开发注释及实例带入公开发布。
    shutil.copy2(sanitized / "rules" / "rules.yaml", program / "rules" / "rules.yaml")
    html = program / "ui" / "static" / "index.html"
    html.write_text(html.read_text("utf-8").replace("异烟肼片", "示例品种"), "utf-8")
    (program / "版本.txt").write_text(f"程序版本：DSH-{version}\n", "utf-8")
    command = """import pathlib,py_compile,sys
base=pathlib.Path(sys.argv[1])
for p in base.rglob('*.py'):
 py_compile.compile(str(p),cfile=str(p.with_suffix('.pyc')),dfile='catalog/'+str(p.relative_to(base)),doraise=True,optimize=2)
 if p.relative_to(base).as_posix() not in ('fc/__init__.py','job/__init__.py','ui/main.py'): p.unlink()
"""
    subprocess.run([str(compiler), "-c", command, str(program)], check=True)
    shutil.copytree(program, stage / "_internal" / "程序默认")
    shutil.copy2(root / "NOTICE.md", stage / "NOTICE.md")
    if any(p.suffix.lower() == ".pdf" for p in stage.rglob("*")):
        raise RuntimeError("运行包中出现 PDF，停止发布")
    dist = root / "dist"
    dist.mkdir(exist_ok=True)
    archive = dist / f"catalog-engine-win32-x64-{version}.zip"
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as output:
        for p in sorted(stage.rglob("*")):
            if p.is_file():
                output.write(p, p.relative_to(stage).as_posix())
    print(json.dumps({"archive": str(archive), "bytes": archive.stat().st_size, "files": len(list(stage.rglob('*')))}, ensure_ascii=False))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--runtime", type=Path, required=True)
    parser.add_argument("--compiler", type=Path, required=True)
    parser.add_argument("--sanitized", type=Path, required=True)
    args = parser.parse_args()
    build(args.source.resolve(), args.runtime.resolve(), args.compiler.resolve(), args.sanitized.resolve())
