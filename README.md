# 408 Judge

408 Judge 是一个本地安装的 VS Code 扩展：它把当前编辑器中尚未保存的 C++ 作答和同目录、同文件名主体的 Markdown 参考讲解发送给 DeepSeek，并在专用 Activity Bar 侧边栏中展示中文评审结果。

## 使用

1. 确保作答与讲解同名，例如 `tree.cpp` / `tree.md` 或 `tree_exam_2024.cpp` / `tree_exam_2024.md`。
2. 打开 `.cpp`（无需先保存最新修改），在编辑器中右键选择“408 Judge: 评审当前 C++ 作答”，或从命令面板执行同名命令。
3. 首次点击评测且尚未配置 Key 时，扩展会自动打开密码输入框；保存后直接继续本次评测，无需再次点击。它只存入 VS Code SecretStorage，不写入设置、日志或错误信息；取消输入则停止本次评测且不发送请求。自动引导过程不显示右下角通知。
4. 在 Activity Bar 的 “408 Judge” 中查看类似 ChatGPT 的单行思考摘要：初始为 `Thinking`，随后由关闭思考的 Flash 模型概括当前阶段；首次收到结论时显示并冻结思考用时，不展示原始思维链。结论 JSON 到达时会被增量解析，直接更新 verdict、总体评价、正确之处、问题、复杂度和最小修复，无需等待整个响应结束。当流式 verdict 首次确定为 `correct` 时，会立即从画面中央向上播放一次增强版 `canvas-confetti` Basic Cannon；彩纸使用 Webview 内的主线程专用 Canvas 直接喷射、绽放并自然下落，不依赖 CSP 受限的 Worker。系统开启“减少动态效果”时自动禁用。带行号的问题可点击回到源码。

必要的局部修正会要求模型同时返回原始代码块与最小连续行替换。扩展先在源码中精确定位原始块，再消除首尾未改变的行，以标准统一 diff 展示删除行、增加行和少量上下文；不会直接修改源码。

扩展不会写入 Problems、生成报告、修改源码或上传题库中的其他文件。每次只评审当前 `.cpp` 及其配对 `.md`。参考讲解作为评审依据之一，而不是唯一答案。

## 命令

- `deepseekJudge.reviewCurrent`：评审当前 C++ 作答。
- `deepseekJudge.setApiKey`：设置或替换 API Key。
- `deepseekJudge.clearApiKey`：从 SecretStorage 删除 API Key。

## 设置

| 设置 | 默认值 | 说明 |
| --- | --- | --- |
| `deepseekJudge.apiBaseUrl` | `https://api.deepseek.com` | API 基础地址 |
| `deepseekJudge.model` | `deepseek-v4-pro` | 判题模型 |
| `deepseekJudge.thinkingLevel` | `high` | 官方思考等级：`disabled`（关闭）、`high`（高强度）、`max`（最大强度） |
| `deepseekJudge.thinkingSummaryModel` | `deepseek-v4-flash` | 单行思考状态摘要模型；始终关闭思考 |
| `deepseekJudge.additionalPrompt` | 空 | 追加个人要求；不会替换内置安全提示词 |
| `deepseekJudge.requestTimeoutSeconds` | `90` | 请求超时秒数 |

请求使用 `POST /chat/completions`、所选官方 thinking 配置、JSON object 响应格式和 SSE 流式传输。关闭思考时发送 `thinking.type: disabled` 且不发送 `reasoning_effort`；另外两档分别发送 `high` 和 `max`。启用思考时，扩展会限频把最新推理片段交给 `deepseek-v4-flash`（可配置）生成极短状态摘要；旁路请求固定关闭思考、一次只运行一个，失败或取消不会影响判题。参数定义参见 [DeepSeek 官方思考模式文档](https://api-docs.deepseek.com/zh-cn/guides/thinking_mode)。连续触发评审会取消旧请求，侧边栏中的取消操作也会终止当前请求。评测期间不显示右下角进度通知。空响应或非法 JSON 会自动重试一次。

## 本地开发与打包

要求 Node.js 20+、npm，以及 VS Code 1.100.0+。

```sh
npm install
npm test
npm run test:integration
npm run build
npm run package
```

安装生成的 VSIX：

```sh
code --install-extension ./408-judge-0.11.4.vsix
```

本项目仅生成本地 VSIX，不包含 Marketplace 发布流程。`fixtures/` 均为原创最小测试数据，不包含教材 PDF 或真实题库内容。
