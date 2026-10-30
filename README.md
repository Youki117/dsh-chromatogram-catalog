# DSH 典型图谱整理

在 DeepSeek Harness 主面板中完成 PDF 导入、典型图谱筛选、人工复核、目录编辑及 PDF/Word 导出。

当前支持 Windows x64，目标宿主为 DSH `0.2.1-rc.2`。首次使用会自动下载本地处理组件，无需自行安装 Python。图谱及任务保存在本机。

## 安装

DSH 的「插件」页面中选择安装插件，输入：

```
https://github.com/Youki117/dsh-chromatogram-catalog/releases/latest/download/dsh-chromatogram-catalog.tgz
```

安装后重启 DSH，在侧栏选择「典型图谱整理」。首次运行会下载约 159 MiB 的识别组件，并显示下载进度，需要保持网络连接。下载采用 GitHub 文件 API 和分段传输；失败时可点击「重新打开」重试。

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

点击「更新至…」并确认后，插件先下载新版安装包，再交给 DSH 自带插件管理器安装，完成后重启 DSH。正在处理图谱或下载组件时会阻止更新。检查失败会显示原因，不阻止使用当前版本；也可手动点击「检查更新」。

版本以正式 Release 为准。仅提交仓库代码不会触发更新。

## 本地数据

组件下载在 `%LOCALAPPDATA%/DSH Chromatogram Catalog/`，图谱任务与识别缓存沿用 `%LOCALAPPDATA%/典型图谱整理/`。插件检查更新不会上传 PDF 或任务内容。

卸载插件不会删除本地任务。当前采用通用目录模板，需要时在「规则」页面导入自己的 Word 模板。

## 开发与发布

插件使用 Node.js 标准库和 DSH 自带 React，无运行时 npm 依赖。`npm test` 执行接口、版本检查和更新行为测试；`npm pack` 生成 DSH 组合包。

`scripts/build_engine.py` 将现有 Windows 运行时、最新任务/界面模块与脱敏模板封装成版本化组件，输出到 `dist/`。业务模块编译为 Python 3.11 字节码；这不提供防逆向保证。

每个正式 Release 包含版本化插件 tgz、固定名称 `dsh-chromatogram-catalog.tgz` 和 `catalog-engine-win32-x64-<engineVersion>.zip`。后续如仅修改插件界面或更新逻辑，可保留 `engineVersion`，复用之前发布的识别组件。

发布时同步更新 `market/index.json` 的版本、发布时间及源代码提交号，应用内市场才会显示新版本。该索引是自建市场源，尚未收录到 DSH 默认市场。

## 本地独立版更新通道

本地独立版使用同一仓库的 `desktop-latest` Release，更新包名为 `catalog-desktop-update-年.月.日.修订.zip`。该 Release 发布时设置 `--latest=false`，DSH 插件继续检查自己的最新正式版本。

本地版每次启动在后台检查；有新版后在顶栏下显示提示与说明，用户关闭任务并确认后自动下载安装，重启生效。安装保留本机规则文件、Word 模板及任务，旧程序目录保留用于回退。网络错误不阻止使用现有版本。国内下载源尚未配置。

`scripts/build_desktop.py --source <桌面版src> --sanitized <脱敏版src> --compiler <Python3.11> --version 2026.10.30.1` 生成可分发的小更新包。后续发布在该 Release 上传新版本文件并更新说明，程序按文件名中的日期版本选择最新包。只有兼容现有 Python 3.11 运行库的业务代码更新才能走此通道；变更运行库需另发完整程序。

已有旧版本需要先安装一次带在线更新功能的程序；旧版不会自行获得本功能。为本机安装这次升级时，已保留现有规则和模板。其他旧版本首次手动导入前，应备份自己的规则文件和模板，因为旧版的导入行为可能覆盖它们。
