<p align="center">
  <img src="media/icon.png" width="96" alt="408 Judge 图标">
</p>

# 408 Judge

在 VS Code 里评测 408 数据结构与算法作答。它特别适合考试里常见的函数片段、不完整代码和教材式伪代码，不要求你先补成一个能够编译运行的完整工程。

把题干和作答写进 `.cpp`，右键就能开始评测。408 Judge 会结合题意检查算法逻辑、边界条件和复杂度，告诉你思路是否成立，以及哪里需要修改。

## 使用方式

### 1. 准备 DeepSeek API Key

扩展需要你自己的 DeepSeek API Key，不附带公共或共享 Key。请先在 [DeepSeek 开放平台](https://platform.deepseek.com/api_keys)创建 API Key，并确认账户有可用余额；模型调用产生的费用由 DeepSeek 收取。

首次评测时，VS Code 会提示你输入 Key。它会保存在 VS Code 的安全存储（SecretStorage）中，不会写进项目文件、设置或日志。之后可以从命令面板运行以下命令：

- “408 Judge: 设置 DeepSeek API Key”：更换 Key；
- “408 Judge: 清除 DeepSeek API Key”：删除已保存的 Key。

### 2. 写好题干和作答

`.cpp` 文件应当以一段题干注释开头，写清题目要求、输入输出和必要约束。注释下面紧接你的作答，例如：

```cpp
/*
题目：删除单链表中所有值为 x 的结点。
要求：链表带头结点，结点类型为 LNode；分析时间和空间复杂度。
*/

void DeleteX(LNode *L, int x) {
    // 在这里写完整代码、函数片段或伪代码
}
```

作答不需要包含 `main`、头文件或工程样板，也不需要先通过编译。刚写下但尚未保存的修改同样可以评测。不过，文件里仍要有可识别的代码结构；只有题干、没有作答的文件不会进入评测。

### 3. 开始评测

1. 在编辑器中打开准备好的 `.cpp` 文件。
2. 按 `Cmd+'`（macOS）或 `Ctrl+'`（Windows/Linux），也可以右键选择“408 Judge: 评审当前 C++ 作答”。
3. 在 Activity Bar 打开 “408 Judge” 查看进度和结果。

侧边栏的评审按钮会显示当前快捷键；在 VS Code“键盘快捷方式”中重新绑定或移除后，按钮提示会自动同步。再次评测会自动取消旧请求，侧边栏也可以随时取消当前评测。

### 4. 查看历史记录

每次成功评审后，插件都会保存当时的源码快照和完整结论。点击评审按钮下方的“历史记录”，可以按时间查看不同文件的评测，并打开任意一条历史结果。每个文件最多保留最近 20 条，全部文件合计最多保留 300 条。

## 为什么适合 408 代码题

- 能评测函数片段、不完整 C/C++ 代码和带有明确算法结构的伪代码；
- 会结合题干、函数签名、变量含义、数据结构和控制流理解作答目标；
- 题目信息不完整时，仍会检查越界、空指针、内存管理、控制流和复杂度；
- 不会因为缺少 `main`、头文件或题目预定义的类型就直接判错；
- 参考答案不是唯一标准，复杂度相当或更优的其他写法也可以判为正确。

## 你会看到什么

- 正确、部分正确、错误或信息不足的明确结论；
- 已经成立的思路和需要修正的问题；
- 时间与空间复杂度分析；
- 能定位时可点击跳转的源码行号；
- 只修改必要连续行的最小修复建议。

评测进度和阶段概括会实时显示在侧边栏，完整结果准备好后再展开，不会展示模型的原始思维链。

## 可选：搭配参考讲解

同目录存在同名 Markdown 文件时，扩展会自动把它作为参考：

```text
tree.cpp              → tree.md
tree_exam_2024.cpp    → tree_exam_2024.md
```

没有 Markdown 也能评。参考讲解不是唯一答案，不同但正确的实现不会因此被判错。

## 设置

| 设置 | 默认值 | 用途 |
| --- | --- | --- |
| `deepseekJudge.model` | `deepseek-v4-pro` | 主评审模型 |
| `deepseekJudge.thinkingLevel` | `high` | 思考强度：关闭、高强度或最大强度 |
| `deepseekJudge.additionalPrompt` | 空 | 补充个人评审要求 |
| `deepseekJudge.requestTimeoutSeconds` | `600` | API 请求超时时间 |
| `deepseekJudge.apiBaseUrl` | `https://api.deepseek.com` | 自定义兼容 API 地址 |
| `deepseekJudge.thinkingSummaryModel` | `deepseek-v4-flash` | 思考阶段概括模型 |

更高的思考强度通常需要更多时间，也可能产生更多 API 用量。设置从下一次评测开始生效。

## 数据与隐私

扩展只在你主动评测时发送当前 C++ 作答、可选的同名 Markdown 和附加要求。它不会上传工作区中的其他文件、修改源码或收集遥测。数据处理方式以 DeepSeek 或你配置的 API 服务条款为准，详见 [隐私说明](PRIVACY.md)。

## 遇到问题

- **提示 401 或 403**：检查 API Key 是否有效，以及账户是否有可用余额。
- **提示模型不存在**：恢复默认模型，或确认自定义服务支持该模型。
- **长时间没有结果**：检查网络和 API 服务状态，然后取消并重新评测。
- **结论缺少背景**：补全文件开头的题干注释，或添加同名 Markdown 与 `deepseekJudge.additionalPrompt`。

更多排查方法见 [支持说明](SUPPORT.md)。提交问题前，请删除 API Key、个人路径和私有代码：[GitHub Issues](https://github.com/FanTuani/408-Judge/issues)。

## 许可

408 Judge 使用 [MIT License](LICENSE)。版本变化见 [CHANGELOG.md](CHANGELOG.md)。
