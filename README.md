# React Flow Pro Examples

独立的 **Next.js 16 + React 19 + TypeScript** 项目，提供 15 个 React Flow Pro 功能示例。全部运行源码位于本仓库，不需要 dlab、后端服务或其他本地项目。

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

本机项目目录是 `/usr/src/git-project/react-flow-pro-example-`。开发服务监听 `0.0.0.0:3000`，浏览器打开 <http://localhost:3000>；通过网络访问时将 localhost 替换为开发主机地址。

默认打开 Dynamic Layouting。支持中文和英文搜索、侧栏分类、URL hash 直达、浏览器前进后退、重置示例及窄屏导航。例如 <http://localhost:3000/#editable-edge>。

## 功能

| 分类                | 示例                                                        |
| ------------------- | ----------------------------------------------------------- |
| Nodes               | 节点位置动画、流程图形状                                    |
| Edges               | WASM 避障路由、可编辑连线                                   |
| Interaction         | 辅助线与吸附、本地协作、复制剪切粘贴、撤销重做              |
| Subflows & Grouping | 选择分组、父子节点关系                                      |
| Layout              | 展开折叠、Dagre / D3 / ELK 自动布局、力导向布局、动态树布局 |
| Whiteboard          | 自由绘制、选择、移动与缩放笔迹                              |

协作使用 Yjs 和 BroadcastChannel，支持同一浏览器、同源标签页或窗口中的表单、图、光标及连接草稿同步。在 Collaborative 中创建 Flow，然后从另一个同源标签页打开生成的链接。此实现不提供跨设备协作服务。

图数据保存在内存中。切换或重置示例会创建新的画布状态；协作房间有在线参与者时，新加入的标签页会同步当前文档。刷新后不会从服务端恢复数据。

## 结构

```text
src/app/                       Next.js App Router、布局、页面和基础主题
src/components/                浏览器组件入口、搜索、分类导航与重置
packages/react-flow-pro/       @react-flow-pro-example/core，可单独构建和打包
  src/catalog.ts               15 个示例 ID、标题与操作提示
  src/pro-example-canvas.tsx   按需加载示例，提供统一 Canvas 与独立组件
  src/examples/                全部示例的节点、连线、交互与布局实现
  src/collaboration/           Yjs 本地协作传输
  src/controls/                Leva 布局参数面板
  src/lib/                    React Flow 几何工具
  src/runtime/                ID 与剪贴板工具
  src/styles/                 共享主题、隔离容器及 15 个示例的样式
  docs/                       架构、源码阅读与功能原理
```

应用、公共 API、协作传输、参数面板和几何工具使用 TypeScript。迁入的 15 个示例保留可读 JSX 实现与配套 `.d.ts`，由 Next.js 编译。功能包不依赖原项目的 editor、ui、domain 或设计 token 生成流程。

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
