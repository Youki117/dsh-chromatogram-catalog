# 分发说明

本插件在本机运行图谱识别、人工复核和文档导出。GitHub 用于分发程序和检查版本。

Windows 处理组件复用现有图谱程序的 Python 3.11、pywebview、RapidOCR、OpenVINO、ONNX Runtime、pypdf、pypdfium2、Pillow、NumPy、PyYAML 和 pypinyin 等第三方组件。第三方许可和声明随运行时分发，相关组件的权利归各自作者所有。

发布包使用通用 Word 目录模板，不包含客户 PDF、人工目录、识别缓存或历史任务。使用者应自行导入获授权的模板，并复核陌生报表和品种的处理结果。

本项目自有代码暂未授予开源许可；公开提供下载不表示可重新许可或销售。
