"""DSH 内嵌工作台的本地桥接；构建时作为运行时 ui.main 安装。"""
from __future__ import annotations

import json
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

STATIC = Path(__file__).resolve().parent / "static"
METHODS = frozenset("recent_jobs delete_job close_job new_job open_job pick_pdfs add_paths merge_files reorder_files remove_file state pages preview set_keep set_scope set_settings set_medium set_group_medium catalog set_entry_name set_page_fields edit_entry copy_entry add_entry move_entry reorder_entries remove_entry export_check export open_path rules_text import_template reload_rules edits import_rules".split())
SHIM = """<script>
window.pywebview = {api: new Proxy({}, {get: (_, name) => async (...args) => {
  const response = await fetch('api/' + name, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(args)});
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || '本地服务请求失败');
  return value;
}})};
</script><style>#btnImportUpdate{display:none!important}</style>"""


def make_handler(api, token: str):
    prefix = f"/{token}/"
    lock = threading.RLock()

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def reply(self, status, value):
            data = json.dumps(value, ensure_ascii=False, default=str).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.end_headers()
            self.wfile.write(data)

        def route(self):
            path = self.path.split("?", 1)[0]
            return path[len(prefix):] if path.startswith(prefix) else None

        def do_GET(self):
            route = self.route()
            if route is None:
                return self.reply(404, {"error": "Not found"})
            if route == "health":
                return self.reply(200, {"ok": True, "busy": bool(api._svc and api._svc.busy())})
            target = (STATIC / (route or "index.html")).resolve()
            if not target.is_file() or STATIC.resolve() not in target.parents:
                return self.reply(404, {"error": "Not found"})
            data = target.read_bytes()
            if target.suffix == ".html":
                data = data.replace(b"</head>", SHIM.encode("utf-8") + b"</head>")
            mime = {".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8", ".css": "text/css; charset=utf-8"}.get(target.suffix, "application/octet-stream")
            self.send_response(200)
            self.send_header("Content-Type", mime)
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Referrer-Policy", "no-referrer")
            self.end_headers()
            self.wfile.write(data)

        def do_POST(self):
            route = self.route()
            if not route or not route.startswith("api/") or route[4:] not in METHODS:
                return self.reply(404, {"error": "方法不可用，请通过 DSH 插件管理更新"})
            if self.headers.get("Content-Type", "").split(";")[0] != "application/json":
                return self.reply(415, {"error": "需要 JSON 请求"})
            try:
                size = int(self.headers.get("Content-Length", "0"))
                if not 0 <= size <= 1024 * 1024:
                    return self.reply(413, {"error": "请求过大"})
                args = json.loads(self.rfile.read(size))
                if not isinstance(args, list):
                    return self.reply(400, {"error": "参数必须是数组"})
                with lock:
                    value = getattr(api, route[4:])(*args)
                return self.reply(200, value)
            except Exception as exc:
                return self.reply(400, {"error": f"{type(exc).__name__}: {exc}"})

    return Handler


def run():
    import webview
    from .api import Api

    token = os.environ.get("DSH_CATALOG_TOKEN", "")
    if len(token) != 48 or not all(c in "0123456789abcdef" for c in token):
        raise RuntimeError("请从 DSH 的典型图谱整理插件启动")
    ready = Path(os.environ["DSH_CATALOG_READY_FILE"])
    api = Api()
    # 保留原生文件选择器；图谱界面由 DSH 的主面板承载。
    window = webview.create_window("图谱文件选择", html="<html><body></body></html>", hidden=True, width=400, height=300)
    api._window = window
    server = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(api, token))
    server.daemon_threads = True

    def serve():
        ready.write_text(json.dumps({"port": server.server_port}), encoding="utf-8")
        server.serve_forever()

    try:
        webview.start(serve, private_mode=False)
    finally:
        server.shutdown()
        server.server_close()
        api._release()
        ready.unlink(missing_ok=True)
