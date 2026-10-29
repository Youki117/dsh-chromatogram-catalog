"""在打包运行时中，用合成文件验证目录与 PDF 同源导出。"""
import json
import os
import zipfile
from pathlib import Path


def run():
    import webview
    from pypdf import PdfReader
    from ui.api import Api

    work = Path(os.environ["CATALOG_EXPORT_TEST_DIR"])
    api = Api()

    class Dialog:
        def create_file_dialog(self, mode, **kwargs):
            assert mode == webview.FOLDER_DIALOG
            return [str(work)]

    api._window = Dialog()
    try:
        result = api.new_job("合成导出测试", "示例品种", "0月")
        assert "error" not in result, result
        result = api.add_paths([str(work / "合成图谱.pdf")])
        assert "error" not in result, result
        api._svc.wait(90)
        fid = api._svc.job.files[0].id
        result = api.add_entry(fid, 1, {"name": "人工条目甲", "condition": "0月", "item": "含量"})
        assert "error" not in result, result
        row = api.catalog()["rows"][0]
        result = api.copy_entry(row["id"], {"name": "人工条目乙", "condition": "加速3月", "item": "含量"})
        assert "error" not in result, result
        result = api.export()
        assert "error" not in result, result
        out = Path(result["out_dir"])
        pdfs = list(out.rglob("*.pdf"))
        docs = list(out.rglob("*.docx"))
        assert len(pdfs) == len(docs) == 1, (pdfs, docs)
        assert len(PdfReader(pdfs[0]).pages) == 2
        with zipfile.ZipFile(docs[0]) as doc:
            xml = doc.read("word/document.xml").decode("utf-8")
        assert "人工条目甲" in xml and "人工条目乙" in xml
        report = {"passed": True, "pdfPages": 2, "wordEntries": 2, "sharedSourcePage": True}
        (work / "export-result.json").write_text(json.dumps(report), "utf-8")
        print(json.dumps(report), flush=True)
    finally:
        api._release()
