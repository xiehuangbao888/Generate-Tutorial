#!/usr/bin/env node
// generate.js
// 根据 GitHub 仓库或本地项目生成中文 Markdown 使用教程

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const os = require('os');
const OpenAI = require('openai');

const OUTPUT_DIR = path.join(__dirname, 'output');

const PRIORITY_FILES = [
  'README.md', 'readme.md', 'README.rst', 'README',
  'package.json', 'requirements.txt', 'Cargo.toml', 'go.mod',
  'pyproject.toml', 'setup.py', 'Makefile', 'CMakeLists.txt',
  'Dockerfile', 'docker-compose.yml', 'platformio.ini',
];

function readFile(filePath, maxSize = 100 * 1024) {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size > maxSize) return null;
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

function collectFiles(dir, max = 100) {
  const files = [];
  const queue = [''];
  while (queue.length && files.length < max) {
    const rel = queue.shift();
    const abs = path.join(dir, rel);
    let entries;
    try {
      entries = fs.readdirSync(abs, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const childRel = rel ? path.join(rel, e.name) : e.name;
      const childAbs = path.join(dir, childRel);
      if (e.isDirectory()) {
        if (e.name.startsWith('.') || ['node_modules', '__pycache__', 'target', 'build', 'dist'].includes(e.name)) continue;
        queue.push(childRel);
      } else if (e.isFile() && !/\.(png|jpg|jpeg|gif|webp|svg|ico|pdf|zip|tar|gz|mp4|mp3|bin|so|dll|exe)$/i.test(childRel)) {
        files.push(childRel);
      }
    }
  }
  return files;
}

function analyzeProject(projectDir) {
  const readme = readFile(path.join(projectDir, 'README.md'), 500 * 1024)
    || readFile(path.join(projectDir, 'readme.md'), 500 * 1024)
    || readFile(path.join(projectDir, 'README.rst'), 500 * 1024)
    || readFile(path.join(projectDir, 'README'), 500 * 1024);

  const priority = {};
  for (const f of PRIORITY_FILES) {
    const content = readFile(path.join(projectDir, f));
    if (content) priority[f] = content;
  }

  const examples = [];
  for (const dir of ['examples', 'example', 'demo', 'demos', 'samples']) {
    const abs = path.join(projectDir, dir);
    if (!fs.existsSync(abs)) continue;
    for (const rel of collectFiles(abs, 20)) {
      const content = readFile(path.join(abs, rel));
      if (content) examples.push({ path: path.join(dir, rel), content });
    }
  }

  return { readme, priority, examples, tree: collectFiles(projectDir, 50) };
}

function detectName(projectDir, repoUrl) {
  if (repoUrl) {
    const m = repoUrl.match(/github\.com\/[^/]+\/([^/]+?)(?:\.git)?$/i);
    if (m) return m[1];
  }
  const readme = readFile(path.join(projectDir, 'README.md'), 500 * 1024);
  if (readme) {
    const title = readme.match(/^#\s+(.+)$/m);
    if (title) return title[1].trim();
  }
  try {
    const pkg = JSON.parse(readFile(path.join(projectDir, 'package.json')) || '{}');
    if (pkg.name) return pkg.name;
  } catch {}
  return path.basename(projectDir);
}

function cloneRepo(url) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wta-'));
  console.log(`[clone] ${url}`);
  execFileSync('git', ['clone', '--depth', '1', url, tmp], { stdio: 'ignore', timeout: 120000 });
  return tmp;
}

function buildPrompt(name, info, repoUrl) {
  const context = [];
  context.push(`Project: ${name}`);
  if (repoUrl) context.push(`Repository: ${repoUrl}`);
  if (info.readme) context.push('\n--- README ---\n' + info.readme.slice(0, 15000));
  for (const [f, c] of Object.entries(info.priority)) {
    context.push(`\n--- ${f} ---\n` + c.slice(0, 8000));
  }
  if (info.examples.length) {
    context.push('\n--- Examples ---');
    for (const ex of info.examples.slice(0, 5)) {
      context.push(`\n### ${ex.path}\n` + ex.content.slice(0, 4000));
    }
  }
  context.push('\n--- File Tree ---\n' + info.tree.slice(0, 60).join('\n'));

  const system = `你是一位技术文档工程师。请根据提供的项目信息，生成一篇中文 Markdown 使用教程，风格参考典型的 LeRobot / SO-ARM 教程：
- 标题用一级标题 #
- 开头用 1~2 句话说明文档目的
- 用 ## 1. xxx、## 2. xxx 编号分节
- 包含：硬件连接/环境准备、安装、分步操作、常用命令、参数说明、训练/评估（如适用）
- 命令用 bash 代码块
- 关键参数用表格
- 只输出纯 Markdown，不要 YAML frontmatter
- 只基于提供的项目信息，不要编造`;

  return { system, user: context.join('\n') };
}

async function callLLM(prompt) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('请先设置 OPENAI_API_KEY 环境变量');

  const options = { apiKey };
  if (process.env.OPENAI_BASE_URL) {
    options.baseURL = process.env.OPENAI_BASE_URL;
  }

  const client = new OpenAI(options);

  let model = process.env.OPENAI_MODEL;
  if (!model) {
    if (process.env.OPENAI_BASE_URL) {
      throw new Error('使用非 OpenAI 接口时，请设置 OPENAI_MODEL（例如 kimi-k3、deepseek-chat）');
    }
    model = 'gpt-4o';
  }

  const baseInfo = process.env.OPENAI_BASE_URL ? ` baseURL=${process.env.OPENAI_BASE_URL}` : '';
  console.log(`[generate] model=${model}${baseInfo}`);

  const res = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: prompt.system },
      { role: 'user', content: prompt.user },
    ],
    temperature: process.env.OPENAI_TEMPERATURE ? Number(process.env.OPENAI_TEMPERATURE) : undefined,
    max_tokens: 16000,
  });
  return res.choices[0].message.content;
}

function writeMarkdown(name, content) {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const safeName = name.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, '_').replace(/_+/g, '_');
  const filePath = path.join(OUTPUT_DIR, `${safeName}_tutorial.md`);
  fs.writeFileSync(filePath, content.trim() + '\n', 'utf8');
  return filePath;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--github' || args[i] === '-g') out.github = args[++i];
    else if (args[i] === '--local' || args[i] === '-l') out.local = args[++i];
    else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`用法：
  node generate.js --github https://github.com/user/repo
  node generate.js --local /path/to/project

环境变量：
  OPENAI_API_KEY   必填，API Key
  OPENAI_BASE_URL  可选，OpenAI-Compatible API 地址
  OPENAI_MODEL     可选，默认 gpt-4o

支持的 API：
  - OpenAI（默认）
  - 任意 OpenAI-Compatible 接口，如 OpenRouter、DeepSeek、Moonshot/Kimi K3、SiliconFlow 等

示例（OpenRouter）：
  export OPENAI_API_KEY=sk-or-v1-...
  export OPENAI_BASE_URL=https://openrouter.ai/api/v1
  export OPENAI_MODEL=openai/gpt-4o
  node generate.js --github https://github.com/user/repo

示例（Kimi K3 / Moonshot）：
  export OPENAI_API_KEY=sk-...
  export OPENAI_BASE_URL=https://api.moonshot.cn/v1
  export OPENAI_MODEL=kimi-k3
  node generate.js --github https://github.com/user/repo`);
      process.exit(0);
    }
  }
  if (!out.github && !out.local) {
    console.error('错误：请提供 --github 或 --local');
    process.exit(1);
  }
  return out;
}

async function main() {
  const args = parseArgs();
  const repoUrl = args.github || null;
  const projectDir = repoUrl ? cloneRepo(repoUrl) : path.resolve(args.local);

  if (!repoUrl && !fs.existsSync(projectDir)) {
    throw new Error(`路径不存在: ${projectDir}`);
  }

  const name = detectName(projectDir, repoUrl);
  console.log(`[analyze] ${name}`);
  const info = analyzeProject(projectDir);
  console.log(`[analyze] files=${info.tree.length}, examples=${info.examples.length}`);

  const prompt = buildPrompt(name, info, repoUrl);
  const markdown = await callLLM(prompt);
  const filePath = writeMarkdown(name, markdown);

  console.log(`[done] ${filePath}`);
}

main().catch((err) => {
  console.error('[error]', err.message);
  process.exit(1);
});
