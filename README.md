# DSH 典型图谱整理

在 DeepSeek Harness 主面板中完成 PDF 导入、典型图谱筛选、人工复核、目录编辑及 PDF/Word 导出。

当前支持 Windows x64，目标宿主为 DSH `0.2.1-rc.2`。首次使用会自动下载本地处理组件，无需自行安装 Python。图谱及任务保存在本机。

## 安装

DSH 的「插件」页面中选择安装插件，输入：

```
https://github.com/Youki117/dsh-chromatogram-catalog/releases/latest/download/dsh-chromatogram-catalog.tgz
```

安装后重启 DSH，在侧栏选择「典型图谱整理」。首次运行会下载并解压 OCR 运行组件，需要保持网络连接。

使用 DSH Web 版时，也可通过 CLI 安装到 Web 配置：

```powershell
dsh plugin --profile web add https://github.com/Youki117/dsh-chromatogram-catalog/releases/latest/download/dsh-chromatogram-catalog.tgz
```

## 搜索安装

开启 DSH 实验性的「自定义插件市场」，添加索引源：

```
https://raw.githubusercontent.com/Youki117/dsh-chromatogram-catalog/main/market/index.json
```

然后在「发现」中搜索「典型图谱整理」。DSH 当前需要先添加市场源。

## 更新

每次启动 DSH 且插件已启用时，插件会在后台检查 GitHub 最新正式 Release。有新版会弹出提醒，并在工作台顶部显示版本和更新说明。

点击「更新至…」并确认后，由 DSH 自带插件管理器安装新版，完成后重启 DSH。正在处理图谱时会阻止更新。检查失败会显示原因，不阻止使用当前版本；也可手动点击「检查更新」。

版本以正式 Release 为准。仅提交仓库代码不会触发更新。

## 本地数据

组件下载在 `%LOCALAPPDATA%/DSH Chromatogram Catalog/`，图谱任务与识别缓存沿用 `%LOCALAPPDATA%/典型图谱整理/`。插件检查更新不会上传 PDF 或任务内容。

卸载插件不会删除本地任务。当前采用通用目录模板，需要时在「规则」页面导入自己的 Word 模板。

## 开发与发布

插件使用 Node.js 标准库和 DSH 自带 React，无运行时 npm 依赖。`npm test` 执行接口、版本检查和更新行为测试；`npm pack` 生成 DSH 组合包。

`scripts/build_engine.py` 将现有 Windows 运行时、最新任务/界面模块与脱敏模板封装成版本化组件，输出到 `dist/`。业务模块编译为 Python 3.11 字节码；这不提供防逆向保证。

每个正式 Release 包含版本化插件 tgz、固定名称 `dsh-chromatogram-catalog.tgz` 和 `catalog-engine-win32-x64-<engineVersion>.zip`。后续如仅修改插件界面或更新逻辑，可保留 `engineVersion`，复用之前发布的识别组件。
