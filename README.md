# 408 Judge

408 Judge 是一个面向计算机考研 408 数据结构与算法练习的 VS Code 扩展。它使用 DeepSeek 评审当前 C++ 作答，并在独立侧边栏中给出结论、问题定位、复杂度分析和最小修改建议。

## 功能

- 评审编辑器中尚未保存的最新 C++ 内容。
- 自动查找同目录、同文件名主体的 Markdown 参考讲解。
- 展示阶段化的思考状态，但不展示模型原始思维链。
- 思考概括和最终结论按完整内容块平滑出现，不暴露未完成的流式文本。
- 区分 `correct`、`partially_correct`、`incorrect` 和 `insufficient`。
- 支持带行号的问题定位和最小连续行修复建议。
- 结论正确时播放一次庆祝动画；系统开启“减少动态效果”时自动禁用。
- API Key 仅保存在 VS Code SecretStorage 中。

扩展不会修改源码、写入 Problems、生成本地报告，也不会上传当前题目之外的目录内容。

## 使用要求

- VS Code 1.100.0 或更高版本。
- DeepSeek API Key，以及可用的 API 余额。
- 当前编辑器中的文件语言为 C++。

## 快速开始

1. 打开需要评审的 `.cpp` 文件。
2. 在编辑器右键菜单中选择“408 Judge: 评审当前 C++ 作答”，或从命令面板运行同名命令。
3. 首次使用时按提示输入 DeepSeek API Key。
4. 在 Activity Bar 中打开 “408 Judge” 查看思考阶段和评审结果。

同目录存在同名讲解时会自动作为参考，例如：

```text
tree.cpp              -> tree.md
tree_exam_2024.cpp    -> tree_exam_2024.md
```

没有 Markdown 讲解也可以继续评审。模型会根据函数签名、参数、数据结构和代码行为进行保守判断，并说明关键假设。

## 数据与隐私

评审时，扩展会把当前 C++ 内容、可选的同名 Markdown 讲解和用户设置的附加提示词发送到配置的 API 地址。默认地址是 `https://api.deepseek.com`。使用自定义 `apiBaseUrl` 时，数据会发送给该地址对应的服务提供者。

扩展本身不收集遥测或分析数据。API Key 不会写入工作区配置、日志或错误信息。DeepSeek 或自定义 API 服务如何处理请求数据，取决于相应服务提供者的条款与隐私政策。完整说明参见 [PRIVACY.md](PRIVACY.md)。

## 命令

- `deepseekJudge.reviewCurrent`：评审当前 C++ 作答。
- `deepseekJudge.setApiKey`：设置或替换 API Key。
- `deepseekJudge.clearApiKey`：从 SecretStorage 删除 API Key。

## 设置

| 设置 | 默认值 | 说明 |
| --- | --- | --- |
| `deepseekJudge.apiBaseUrl` | `https://api.deepseek.com` | API 基础地址 |
| `deepseekJudge.model` | `deepseek-v4-pro` | 主评审模型 |
| `deepseekJudge.thinkingLevel` | `high` | `disabled`、`high` 或 `max` |
| `deepseekJudge.thinkingSummaryModel` | `deepseek-v4-flash` | 思考阶段概括模型 |
| `deepseekJudge.additionalPrompt` | 空 | 追加个人评审要求 |
| `deepseekJudge.requestTimeoutSeconds` | `90` | 单次请求超时秒数 |

主请求使用 OpenAI 兼容的 `POST /chat/completions` 接口、JSON object 响应格式和 SSE。连续触发评审会取消旧请求；侧边栏中的取消操作也会终止当前请求。空响应或非法 JSON 会自动重试一次。

## 本地开发

要求 Node.js 20+ 和 npm：

```sh
npm install
npm test
npm run test:integration
npm run package
```

安装生成的 VSIX：

```sh
code --install-extension ./408-judge-0.11.8.vsix
```

Marketplace 发布前，也可以从仓库的 Release 下载 VSIX 并手动安装。

## 支持与许可

- 使用问题和功能建议：参见 [SUPPORT.md](SUPPORT.md)。
- 版本记录：参见 [CHANGELOG.md](CHANGELOG.md)。
- 本项目使用 [MIT License](LICENSE)。

`fixtures/` 只包含原创的最小测试数据，不包含教材 PDF 或真实题库内容。
