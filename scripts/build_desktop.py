"""从现有桌面程序生成可公开发布的小更新包；运行库与客户资料均不进入更新包。"""
from __future__ import annotations

import argparse
import shutil
import subprocess
import zipfile
from datetime import datetime
from pathlib import Path


def build(source: Path, sanitized: Path, compiler: Path, version: str) -> Path:
    root = Path(__file__).resolve().parents[1]
    import re

    if not re.fullmatch(r"\d{4}\.\d{1,2}\.\d{1,2}\.\d+", version):
        raise ValueError("版本格式为 2026.10.30.1")
    stage = root / ".build" / f"desktop-{version}" / "程序"
    if stage.parent.exists():
        raise ValueError(f"构建目录已存在：{stage.parent}")
    stage.mkdir(parents=True)
    for package in ("fc", "job", "ui", "rules"):
        shutil.copytree(source / package, stage / package,
                        ignore=shutil.ignore_patterns("__pycache__", "*.pyc", "*.bak", "assets", "README.md", "changelog.md"))
    for name in ("corpus", "cli", "validate", "evaluate", "catalog_eval", "trace", "conditions"):
        (stage / "fc" / f"{name}.py").unlink(missing_ok=True)
    for name in ("devserver", "background"):
        (stage / "ui" / f"{name}.py").unlink(missing_ok=True)
    for name in ("rules.yaml", "目录模板.docx"):
        shutil.copy2(sanitized / "rules" / name, stage / "rules" / name)
    html = stage / "ui" / "static" / "index.html"
    html.write_text(html.read_text("utf-8").replace("异烟肼片", "示例品种"), "utf-8")
    (stage / "版本.txt").write_text(f"程序版本：{version}\n构建时间：{datetime.now():%Y-%m-%d %H:%M}\n", "utf-8")
    compile_script = """import pathlib,py_compile,sys
root=pathlib.Path(sys.argv[1])
for p in root.rglob('*.py'):
 py_compile.compile(str(p),cfile=str(p.with_suffix('.pyc')),dfile='desktop/'+str(p.relative_to(root)),doraise=True,optimize=2)
 if p.relative_to(root).as_posix() not in ('fc/__init__.py','job/__init__.py','ui/main.py'): p.unlink()
"""
    subprocess.run([str(compiler), "-c", compile_script, str(stage)], check=True)
    destination = root / "dist" / f"catalog-desktop-update-{version}.zip"
    destination.parent.mkdir(exist_ok=True)
    with zipfile.ZipFile(destination, "w", zipfile.ZIP_DEFLATED) as archive:
        for file in sorted(stage.rglob("*")):
            if file.is_file():
                if file.suffix.lower() in (".pdf", ".jsonl", ".log", ".bak"):
                    raise ValueError(f"发布包含非程序文件：{file.name}")
                archive.write(file, "程序/" + file.relative_to(stage).as_posix())
    print(f"{destination} ({destination.stat().st_size} bytes)")
    return destination


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--sanitized", type=Path, required=True)
    parser.add_argument("--compiler", type=Path, required=True)
    parser.add_argument("--version", required=True)
    args = parser.parse_args()
    build(args.source.resolve(), args.sanitized.resolve(), args.compiler.resolve(), args.version)
