# Wiki Tutorial Agent

根据 GitHub 仓库或本地项目，自动生成中文 Markdown 使用教程。

## 环境要求

- Node.js >= 18
- 一个 LLM API Key（OpenAI 或任意 OpenAI-Compatible 接口）

## 安装

```bash
git clone https://github.com/<你的用户名>/wiki-tutorial-agent.git
cd wiki-tutorial-agent
npm install
```

## 使用

```bash
export OPENAI_API_KEY=sk-...

# 从 GitHub 仓库生成
node generate.js --github https://github.com/user/repo

# 从本地项目生成
node generate.js --local /path/to/project
```

生成的教程保存在 `output/` 目录下。


## 配置示例

### Kimi for Coding

适用于 `sk-kimi-` 开头的订阅 Key：

```bash
export OPENAI_API_KEY=sk-kimi-...
export OPENAI_BASE_URL=https://api.kimi.com/coding/v1
export OPENAI_MODEL=kimi-k3
node generate.js --github https://github.com/user/repo
```

### Moonshot / Kimi 开放平台

适用于 [platform.moonshot.cn](https://platform.moonshot.cn) 生成的 `sk-` Key：

```bash
export OPENAI_API_KEY=sk-...
export OPENAI_BASE_URL=https://api.moonshot.cn/v1
export OPENAI_MODEL=kimi-k3
node generate.js --github https://github.com/user/repo
```

## 支持的 API

- **OpenAI**（默认，模型 `gpt-4o`）
- 任意 **OpenAI-Compatible** 接口，例如：
  - [Kimi for Coding](https://www.kimi.com/)
  - [Moonshot / Kimi](https://platform.moonshot.cn/)
  - [OpenRouter](https://openrouter.ai/)
  - [DeepSeek](https://platform.deepseek.com/)
  - [SiliconFlow](https://siliconflow.cn/)

## 环境变量

| 变量 | 必填 | 说明 |
|------|------|------|
| `OPENAI_API_KEY` | 是 | API Key |
| `OPENAI_BASE_URL` | 否 | OpenAI-Compatible API 地址，不填则用 OpenAI 官方接口 |
| `OPENAI_MODEL` | 用第三方接口时必填 | 模型名称，默认 `gpt-4o` |
| `OPENAI_TEMPERATURE` | 否 | 采样温度，默认不传（使用各平台默认值） |


