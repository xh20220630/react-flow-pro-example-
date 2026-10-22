# React Flow Pro Examples

独立的 **Next.js 16 + React 19 + TypeScript** 项目，提供 15 个 React Flow Pro 功能示例。全部运行源码位于本仓库，不需要 dlab、外部协作服务或其他本地项目；项目自带协作后端。

仓库：[xh20220630/react-flow-pro-example-](https://github.com/xh20220630/react-flow-pro-example-)

## 启动

使用 Node **24.13.0** 和 pnpm **10.20.0**：

```sh
git clone https://github.com/xh20220630/react-flow-pro-example-.git
cd react-flow-pro-example-
nvm use
corepack enable
pnpm install
pnpm dev
```

本机项目目录是 `/usr/src/git-project/react-flow-pro-example-`。开发服务监听 `172.16.0.108:3000`，浏览器打开 <http://172.16.0.108:3000>；生产服务监听 `0.0.0.0:3000`，可使用部署主机地址访问。

默认打开 Dynamic Layouting。支持中文和英文搜索、侧栏分类、URL hash 直达、浏览器前进后退、重置示例及窄屏导航。例如 <http://172.16.0.108:3000/#editable-edge>。

## 功能

| 分类                | 示例                                                        |
| ------------------- | ----------------------------------------------------------- |
| Nodes               | 节点位置动画、流程图形状                                    |
| Edges               | WASM 避障路由、可编辑连线                                   |
| Interaction         | 辅助线与吸附、多人协作、复制剪切粘贴、撤销重做              |
| Subflows & Grouping | 选择分组、父子节点关系                                      |
| Layout              | 展开折叠、Dagre / D3 / ELK 自动布局、力导向布局、动态树布局 |
| Whiteboard          | 自由绘制、选择、移动与缩放笔迹                              |

Collaborative 按[官方 Pro 示例](https://reactflow.dev/examples/interaction/collaborative)的 Yjs + `y-websocket` 方式连接房间。在页面中创建 Flow，使用 Share 复制链接后，从另一个浏览器或另一台能访问本项目的设备打开同一链接；右键画布可新增文本和复选框节点。节点拖动、增删、连线与表单实时同步，光标和连接草稿通过 Yjs Awareness 同步，退出或断线后移除在线状态。

`pnpm dev` 和 `pnpm start` 同时启动 Next.js 与协作服务，共用 3000 端口。开发服务保留当前的 `172.16.0.108` 监听地址；浏览器和协作连接使用同一访问域名，HTTP 自动使用 `ws`，HTTPS 自动使用 `wss`。通过反向代理部署时，需要把 `/collaboration/*` 的 WebSocket Upgrade 转发到应用。

其他示例的图数据保存在当前画布内存中，切换或重置后创建新状态。协作房间的图数据保存在服务端进程内存中，刷新、所有人退出后再加入都会恢复同一房间的文档；服务重启后清空，不提供磁盘持久化。服务端负责首次初始化，多个用户同时加入不会重复生成初始节点。

## 结构

```text
src/app/                       Next.js App Router、布局、页面和基础主题
src/server/                    Next.js 自定义服务器与同端口 Yjs WebSocket 房间
src/components/                浏览器组件入口、搜索、分类导航与重置
packages/react-flow-pro/       @react-flow-pro-example/core，可单独构建和打包
  src/catalog.ts               15 个示例 ID、标题与操作提示
  src/pro-example-canvas.tsx   按需加载示例，提供统一 Canvas 与独立组件
  src/examples/                全部示例的节点、连线、交互与布局实现
  src/collaboration/           官方 y-websocket 连接和会话清理
  src/controls/                Leva 布局参数面板
  src/lib/                    React Flow 几何工具
  src/runtime/                ID 与剪贴板工具
  src/styles/                 共享主题、隔离容器及 15 个示例的样式
  docs/                       架构、源码阅读与功能原理
```

应用、公共 API、协作传输、参数面板和几何工具使用 TypeScript。15 个示例统一使用 TSX，节点、连线、事件和算法数据参与严格类型检查；类型声明由源码构建生成，关键数据流与算法附有中文注释。功能包不依赖原项目的 editor、ui、domain 或设计 token 生成流程。

## Next.js 集成

- App Router 保留服务端页面入口，工作台通过 `next/dynamic` 的 `ssr: false` 在浏览器挂载，避免服务端执行 `location`、DOM、BroadcastChannel 等浏览器 API。
- `transpilePackages` 编译本仓库内的功能包源码；每个示例通过静态可分析的 `React.lazy` 入口加载。
- 样式由 `@react-flow-pro-example/core/style.css` 统一导入，示例规则使用 `.rf-pro-example[data-example]` 隔离，不依赖 Vite 的 `?inline`。
- libavoid WASM 来自安装的 `libavoid-js`，由构建工具输出并生成 URL，无需远程下载示例资源。
- React、React DOM 和 `@xyflow/react` 在应用与功能包中保持相同版本，每个示例拥有自己的 Provider 与图状态。

参考：[Next.js 手动安装](https://nextjs.org/docs/app/getting-started/installation)、[浏览器组件按需加载](https://nextjs.org/docs/app/guides/lazy-loading)、[transpilePackages](https://nextjs.org/docs/app/api-reference/config/next-config-js/transpilePackages)。

## 常用命令

| 命令             | 用途                                            |
| ---------------- | ----------------------------------------------- |
| `pnpm dev`       | 启动 Next.js 开发服务，端口 3000                |
| `pnpm build`     | 执行类型检查并构建 Next.js 应用                 |
| `pnpm start`     | 运行构建后的应用，端口 3000                     |
| `pnpm typecheck` | 检查应用和功能包的 TypeScript                   |
| `pnpm lint`      | 检查应用与功能包的编码规范                      |
| `pnpm format`    | 格式化源码、配置和文档                          |
| `pnpm check`     | 执行类型、lint 与格式检查                       |
| `pnpm pro:build` | 单独构建功能包到 `packages/react-flow-pro/dist` |
| `pnpm pro:pack`  | 构建并在根目录 `artifacts` 生成可安装的 tgz     |

生产部署执行 `pnpm install --frozen-lockfile`、`pnpm build`、`pnpm start`。Next.js 应用使用源码入口，无需先执行 `pro:build`。独立功能包继续使用 Vite 生成 ESM 和 CSS；应用本身使用 Next.js。

功能包 API 与使用方式见 [包说明](./packages/react-flow-pro/README.md)，实现细节见 [源码指南](./packages/react-flow-pro/docs/readable-source.md)、[功能原理](./packages/react-flow-pro/docs/pro-features.md) 和 [架构](./packages/react-flow-pro/docs/architecture.md)。迁移范围见 [迁移说明](./docs/migration.md)，依赖归属见 [NOTICE](./packages/react-flow-pro/NOTICE.md)。

## 协作回归

使用 `pnpm exec playwright install chromium` 准备浏览器，然后执行 `pnpm test:collaboration`。该命令先构建应用，再在独立的 3100 端口启动生产服务，使用隔离浏览器会话覆盖房间、图、表单、在线状态与断线重连。设置 `COLLABORATION_BASE_URL` 可以改为访问已启动的服务。
