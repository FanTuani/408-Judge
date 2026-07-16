# Privacy

408 Judge 只在用户主动发起评审时处理数据。

## 发送的数据

扩展会向 `deepseekJudge.apiBaseUrl` 配置的服务发送：

- 当前活动编辑器中的 C++ 内容，包括尚未保存的修改；
- 可选的同名 Markdown 参考讲解；
- 内置评审提示词和用户配置的附加提示词；
- 完成本次请求所需的模型及思考模式参数。

默认 API 地址是 `https://api.deepseek.com`。如果用户修改该地址，上述数据会发送给用户指定的服务提供者。

## 不发送的数据

扩展不会主动发送其他工作区文件、完整题库目录、Git 历史、系统凭据或 VS Code 使用统计。扩展不包含自有遥测或分析服务。

## API Key

API Key 通过 VS Code SecretStorage 保存，不会写入 `settings.json`、工作区文件、扩展日志或错误消息。用户可以随时运行“408 Judge: 清除 DeepSeek API Key”删除本地保存的 Key。

## 第三方服务

API 请求的数据保留、处理地点、模型训练使用和账户计费由 DeepSeek 或用户选择的自定义服务提供者决定。使用前请阅读相应服务的条款和隐私政策。

## 用户控制

用户可以通过取消评审终止当前网络请求，可以删除 API Key，也可以卸载扩展。卸载扩展不会替用户删除第三方服务已经收到的数据。

隐私问题可以通过仓库的 [Issues](https://github.com/FanTuani/408-Judge/issues) 提交，但不要在 Issue 中粘贴 API Key、完整私有源码或其他敏感信息。
