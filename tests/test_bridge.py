import importlib.util
import json
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path

spec = importlib.util.spec_from_file_location("catalog_bridge", Path(__file__).parents[1] / "engine" / "main.py")
bridge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bridge)


class Api:
    _svc = None

    def state(self):
        return {"job": None, "message": "中文任务"}


class BridgeTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        bridge.STATIC = Path(self.temp.name)
        (bridge.STATIC / "index.html").write_text("<html><head></head><body>图谱</body></html>", "utf-8")
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), bridge.make_handler(Api(), "test-token"))
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.url = f"http://127.0.0.1:{self.server.server_port}/"

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.temp.cleanup()

    def test_authenticated_page_and_api(self):
        with urllib.request.urlopen(self.url + "test-token/") as response:
            self.assertEqual(response.headers["Cache-Control"], "no-store")
            self.assertIn("window.pywebview", response.read().decode())
        request = urllib.request.Request(self.url + "test-token/api/state", data=b"[]", headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(request) as response:
            self.assertEqual(json.load(response)["message"], "中文任务")

    def test_rejects_unknown_token_method_and_invalid_arguments(self):
        for route, body, expected in [("bad/api/state", [], 404), ("test-token/api/_release", [], 404),
                                      ("test-token/api/restart", [], 404), ("test-token/api/state", {}, 400)]:
            request = urllib.request.Request(self.url + route, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
            with self.assertRaises(urllib.error.HTTPError) as caught:
                urllib.request.urlopen(request)
            self.assertEqual(caught.exception.code, expected)


if __name__ == "__main__":
    unittest.main()
