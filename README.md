# Creaition AI Image Editor

基于 Angular 18、Angular Material、RxJS 和 `tui-image-editor@3.15.0` 的品牌化图片编辑器。应用通过同源服务端网关接入 Hugging Face Qwen Image Edit，避免浏览器跨域并保护部署环境中的 Token。

![Creaition AI Image Editor](docs/screenshots/editor-ai.png)

## 在线演示

部署完成后在此填写 Vercel 地址：`https://<your-project>.vercel.app`

## 已实现功能

### 编辑器与设计系统

- `ImageEditorComponent`、`ToolbarComponent`、`PropertiesPanelComponent` 和 `EditorCanvasComponent` 分层封装
- TUI Image Editor 3.15.0 负责裁剪、旋转、翻转、绘制、形状、文字、滤镜、撤销、重做和导出
- 图片以独立白色卡片加入同一个大画布，可选择、移动、缩放和删除
- 画布支持按钮缩放、滚轮缩放、`Space + 拖动`平移和适应视口
- 属性面板关闭后画布自动占满释放区域
- 采用 Creaition 黑、白、两级灰色及页面背景色，无额外品牌色
- 按钮圆角 50px、输入框圆角 0、卡片圆角 1rem，按钮最小高度 35px、输入框高度 50px
- 全局设置 `strokeWeight` 的 `wght` 60/80/120 和 `slnt` 0/12，并以 `Eina03-Regular` 回退
- Angular Material Slider、Tooltip 和 Snackbar 使用相同设计令牌
- 移动优先，明确适配 `sm 640px`、`md 768px`、`lg 1024px`、`xl 1280px`
- 移动端折叠工具栏，属性面板改为覆盖层，编辑画布保持自适应

### AI 图片编辑

- Qwen Image Edit、Qwen Image Edit 2509 和 Qwen Image Edit 2511 快速切换
- 每个模型的尺寸、步数、引导强度、变化强度和批量数独立保存
- 选中任意画布白卡后，自动将卡内原图设为当前图生图来源
- AI 结果生成成功后自动加入同一画布，也可从结果或收藏中再次添加
- 图片编辑、指令式局部修改、风格迁移和画质增强模式
- 按模式提供提示词推荐和补全
- 1 至 4 张并行生成，单张失败不会丢弃其他成功结果
- RxJS 统一维护提示词、来源图、结果、历史、收藏、加载、错误和配额
- 处理阶段及预计进度反馈，包含成功、部分失败和完整失败状态
- 401、402、403、413、429、503、网关不可达和网络超时提示
- 对网络异常、429 和 5xx 最多进行 3 次指数退避重试
- 浏览器侧每分钟限流与每月 1000 次保护计数

## 项目结构

```text
src/app/image-editor/
├── ai/
│   ├── ai-panel/                    # AI 交互面板
│   └── core/
│       ├── ai-image-api.service.ts  # Angular HttpClient 请求与重试
│       ├── ai-image-state.service.ts# RxJS 全局状态
│       ├── ai-storage.service.ts    # 本地持久化
│       └── ai-image.types.ts        # 完整 TypeScript 类型
├── core/                            # Creaition 主题与编辑器类型
├── editor-canvas/                   # TUI/Fabric 画布生命周期与命令
├── properties-panel/                # 属性面板
├── toolbar/                         # 顶栏和工具栏
└── image-editor.component.*         # 编辑器根组件与功能编排

server/
├── ai-request.mjs                   # Qwen/Hugging Face 适配层
└── dev-api.mjs                      # 本地同源网关

api/ai/generate.mjs                  # Vercel Serverless Function
```

## 本地运行

环境要求：Node.js 20 或更高版本、npm。

```bash
npm install
npm start
```

打开 `http://localhost:4200`。`npm start` 会同时启动 Angular 和 `http://127.0.0.1:3001` 的本地 AI 网关，前端始终通过同源 `/api/ai/generate` 请求。

生产构建与测试：

```bash
npm run build
npm test -- --watch=false
```

如果本机访问 Hugging Face 需要代理：

```bash
AI_PROXY=http://127.0.0.1:<HTTP代理端口> npm start
```

网关也会读取 `HTTPS_PROXY`、`HTTP_PROXY`、`https_proxy` 和 `http_proxy`。不开代理时，本机网络必须能够直连 Hugging Face 的推理供应商。

## Hugging Face Token

1. 注册并登录 [Hugging Face](https://huggingface.co/join)。
2. 打开 [Access Tokens](https://huggingface.co/settings/tokens)。
3. 创建 Fine-grained Token。
4. 开启调用 Inference Providers 所需权限。
5. 本地可将 Token 输入 AI 面板；线上推荐配置为服务端环境变量 `HF_TOKEN`。
6. 上传图片，选中需要编辑的白卡，填写提示词并点击 `Edit image`。

面板 Token 是可选项。留空时网关自动读取服务端 `HF_TOKEN`；输入时只保存在当前标签页的 `sessionStorage`，不会写入长期 `localStorage`。

## 状态、存储与数据库

项目当前没有数据库。`AiImageStateService` 使用 RxJS `BehaviorSubject` 管理全局 AI 状态：

- 用户偏好和各模型参数：`localStorage`
- Token：`sessionStorage`
- 图片历史和收藏：`localStorage`，最多 12 条
- 月度保护计数：`localStorage`，按月自动重置

浏览器中的 1000 次计数不是 Hugging Face 真实余额。供应商额度耗尽时接口返回 402，应用会标记本地配额耗尽。正式产品应将历史图片迁移到对象存储，并在数据库记录用户、任务和真实配额。

## 部署到 Vercel

项目已包含 `vercel.json` 和 `api/ai/generate.mjs`。

1. 将完整源码推送到 GitHub。
2. 在 Vercel 中导入仓库。
3. Framework Preset 选择 Angular，构建配置使用仓库中的 `vercel.json`。
4. 在 Project Settings > Environment Variables 新建 `HF_TOKEN`，三个环境均勾选。
5. 部署后打开页面，保持 Token 输入框为空，选择图片并测试 AI 编辑。
6. 将部署地址填回本文“在线演示”，并更新真实 AI 生成效果截图。

公开演示不应无限开放个人 Token。生产环境还需要登录鉴权、服务端用户限流和密钥轮换。

## 设计适配思路

设计令牌集中在 `src/styles.scss` 和 `core/creaition.theme.ts`。编辑器以 TUI 的无内置 UI 模式运行，避免旧版菜单限制页面结构；`creaitionEditorTheme` 作为 TUI 主题适配器写入宿主变量和对象选中样式，Angular 自建工具栏及面板复用同一套字体、颜色、圆角和尺寸令牌。

`strokeWeight` 和 `Eina03-Regular` 属于品牌字体，仓库不包含其授权字体文件。应用会优先读取操作系统已安装字体并自动回退；提交生产版本时应在获得授权后补充 WOFF2 文件并在 `@font-face` 中增加资源地址。

页面布局从单列移动端开始，在 640、768、1024、1280px 逐步增强。桌面端由工具栏、无限工作区、AI 面板和属性面板组成；面板显示状态改变后会通知 TUI/Fabric 重新计算尺寸。

## 开发难点与解决方案

### TUI 3.15.0 与现代 Angular

TUI 3.15.0 是旧版 UMD 依赖。项目按顺序加载 `tui-code-snippet`、Fabric、TUI Color Picker 和 TUI Image Editor，并由 Angular 组件接管生命周期。构建中的旧 CSS 语法警告来自上游发布文件，不影响运行。

### 浏览器跨域和 Token 安全

浏览器不直接请求 Hugging Face。Angular `HttpClient` 只访问同源网关，本地由 Node 处理，线上由 Vercel Function 处理，再调用 Hugging Face 官方客户端。这同时解决 CORS 和服务端环境变量读取问题。

### 大画布与 TUI 固定画布模型

TUI 原生画布尺寸有限。项目让 Fabric 画布始终匹配可用视口，并通过视口变换实现缩放和平移；每张图片先合成到独立白卡，再作为可移动对象加入同一工作区。AI 来源保存卡片内原图，不会把其他画布内容一起提交。

### 生成进度和批量失败

Hugging Face 图片接口在完成后一次性返回图片，不提供真实百分比流。界面显示的是预计阶段进度，不伪装成服务端流式数据。批量请求分别捕获错误并合并结果，支持部分成功。

## 已知边界

- “局部修复”使用自然语言指定对象或区域，不是像素蒙版工作流。
- 风格迁移和画质增强通过不同模式指令适配到 Qwen Image Edit，不是独立专用模型。
- 批量生成使用同一组参数并行请求，不提供逐张差异参数矩阵。
- 图片历史受浏览器存储容量限制，没有跨设备同步。
- 线上演示地址和真实 AI 效果截图需要在仓库拥有者的 Hugging Face、GitHub 和 Vercel 账号中完成。
