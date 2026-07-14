# Creaition AI Image Editor

基于 Angular 18 和 `tui-image-editor@3.15.0` 的品牌化图片编辑器，集成 Hugging Face Qwen Image Edit，并使用 RxJS 管理 AI 编辑状态。

![Creaition AI Image Editor](docs/screenshots/editor-ai.png)

## 已实现功能

### 设计系统与编辑器

- Creaition 黑、白、两级灰色设计令牌
- `strokeWeight` 可变字体参数及 `Eina03-Regular` 回退字体
- 50px 按钮圆角、直角输入框、1rem 卡片圆角
- 字重和倾斜联动的悬浮状态
- 图片上传、裁剪、旋转、翻转、画笔、形状、文字、滤镜、撤销、重做、删除和 PNG 导出
- Angular Material 滑块、Tooltip 和 Snackbar 品牌化适配
- 桌面、平板和移动端响应式布局

### AI 图片编辑

- Qwen Image Edit、Qwen Image Edit 2509、Qwen Image Edit 2511 快速切换
- 各模型参数独立保存
- 当前画布一键作为图生图输入
- 图片编辑、局部修复指令、风格迁移、清晰度增强模式
- 提示词推荐和按模式自动补全建议
- 1 至 4 张批量并行处理，支持部分成功结果
- 生成结果一键导入 TUI 编辑画布
- 历史记录和收藏图集
- 加载阶段、进度、成功和错误反馈
- 401、402、403、413、429、503 和网络异常提示
- 3 次指数退避重试
- 每分钟本地请求限制和每月本地请求计数

## 项目结构

```text
src/app/image-editor/
├── ai/
│   ├── ai-panel/                 # AI 编辑面板
│   └── core/
│       ├── ai-image-api.service  # Angular HttpClient 请求层
│       ├── ai-image-state.service# RxJS 全局状态
│       ├── ai-storage.service    # 浏览器持久化
│       └── ai-image.types        # AI 类型定义
├── core/                         # 主题令牌和编辑器类型
├── editor-canvas/                # TUI 编辑器生命周期及命令适配
├── properties-panel/             # 属性面板
├── toolbar/                      # 工具栏
└── image-editor-page.*           # 页面编排与组件联动

server/
├── ai-request.mjs                # Hugging Face 请求适配
└── dev-api.mjs                   # 本地同源 AI 网关

api/ai/generate.mjs               # Vercel Serverless Function
```

## 本地运行

环境要求：Node.js 20 或更高版本、npm。

```bash
npm install
npm start
```

打开终端显示的地址，默认是 `http://localhost:4200`。`npm start` 会同时启动 Angular 和本地 AI 网关，浏览器通过 `/api/ai/generate` 同源访问 AI 服务。

生产构建：

```bash
npm run build
```

如果所在网络需要代理才能访问 Hugging Face/fal，请在启动前配置代理地址：

```bash
AI_PROXY=http://127.0.0.1:你的代理端口 npm start
```

网关也会自动读取标准的 `HTTPS_PROXY`、`HTTP_PROXY`、`https_proxy` 和 `http_proxy` 环境变量。代理端口以 Clash、Surge 或其他代理软件中显示的 HTTP 代理端口为准。

## Hugging Face Token

1. 注册并登录 [Hugging Face](https://huggingface.co/join)。
2. 打开 [Access Tokens](https://huggingface.co/settings/tokens)。
3. 创建 Fine-grained Token。
4. 开启 `Make calls to Inference Providers` 权限。
5. 将生成的 `hf_...` Token 填入 AI 面板。
6. 点击 `Use canvas as source`，输入修改要求，再点击 `Edit image`。

Token 不会写入长期 localStorage，只保存在当前标签页会话的 sessionStorage。线上产品建议在 Vercel 中配置服务端 `HF_TOKEN`，并进一步增加用户认证和服务端配额。

## 状态与持久化

`AiImageStateService` 使用 RxJS `BehaviorSubject` 统一管理提示词、模型参数、生成结果、历史、收藏、加载进度、错误和配额。

- 用户偏好：localStorage
- Token：sessionStorage
- 图片历史和收藏：localStorage，最多保留 12 条
- 月度计数：localStorage，每月自动重置

本地 `1000` 次计数是产品保护上限，不代表 Hugging Face 的真实余额。真实额度耗尽时，接口返回 402，页面会停止继续生成。

## 部署到 Vercel

项目包含 `vercel.json` 和 `api/ai/generate.mjs`。

1. 将完整源码推送到 GitHub。
2. 在 Vercel 导入该仓库。
3. Framework Preset 选择 Angular，其他构建设置读取 `vercel.json`。
4. 可选：在 Vercel Environment Variables 添加 `HF_TOKEN`。
5. 部署后检查 `/api/ai/generate` 与编辑页面是否正常。

如果不配置服务端 `HF_TOKEN`，用户仍可在页面输入自己的 Token。

## 设计适配思路

设计令牌集中在 `src/styles.scss` 和 `core/creaition.theme.ts`。TUI Image Editor 使用官方主题对象处理可配置颜色，再通过受控的全局选择器覆盖其旧版 CSS。Angular 自建组件全部复用相同的字体、颜色、圆角、高度和交互变量，避免各组件单独维护视觉值。

布局采用移动优先的响应式约束：桌面端显示工具栏、画布、AI 面板和属性面板；移动端将工具栏折叠，属性面板转换为底部面板，AI 面板固定在画布底部并独立滚动。

## 开发难点与解决方案

### TUI 3.15.0 是旧版 UMD 库

Angular 按依赖顺序加载 `tui-code-snippet`、Fabric、TUI Color Picker 和 TUI Image Editor。构建出现的旧式 CSS 语法警告来自上游发布文件，不影响运行。

### 浏览器直接访问 Hugging Face 出现跨域错误

前端改为 Angular `HttpClient` 请求同源 `/api/ai/generate`。本地由 Node 网关处理，线上由 Vercel Function 处理，再通过 Hugging Face 官方客户端调用当前可用的推理供应商。

### 批量任务的部分失败

每张图片独立捕获错误，最终合并成功和失败结果。某一张失败不会丢弃其他成功图片，并会在界面显示成功与失败数量。

### 生成进度限制

Hugging Face 当前图片接口只在完成后返回图片，不提供逐步生成百分比。界面展示的是上传、处理中、等待结果等阶段反馈，不宣称是服务端真实流式进度。

## 当前限制

- Qwen Image Edit 以自然语言定位修改区域，不接收独立像素蒙版；“局部修复”是指令式局部编辑。
- 浏览器存储容量有限，正式产品应将图片历史迁移到对象存储和数据库。
- 未登录用户输入的 Token 仅适合演示；生产环境应增加后端鉴权、密钥管理和服务端限流。
- 线上演示地址需要在拥有者的 GitHub/Vercel 账号中完成部署后补充。
