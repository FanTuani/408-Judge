# Support

请在 [GitHub Issues](https://github.com/FanTuani/408-Judge/issues) 报告缺陷或提出功能建议。

提交问题时建议包含：

- VS Code 和扩展版本；
- 操作系统；
- 可复现的最小 C/C++ 示例；
- 实际结果与预期结果；
- 已隐藏 API Key、个人路径和私有代码的错误信息。

请勿公开提交 API Key、真实考试资料、完整私有题库或其他敏感信息。

## 常见问题

### 提示未配置 API Key

运行“408 Judge: 设置 DeepSeek API Key”，输入有效 Key 后重新评审。

### 请求返回 401 或 403

检查 Key 是否有效、账户是否可用，以及自定义 API 地址是否接受该 Key。

### 请求返回模型不存在

恢复默认模型，或者通过 DeepSeek 的模型列表接口确认当前账号可以使用的模型 ID。

### 长时间没有结果

检查网络连接和 API 服务状态，或适当提高 `deepseekJudge.requestTimeoutSeconds`。取消后重新开始会终止旧请求。
