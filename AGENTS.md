# 开发约定

- 先阅读 README.md；使用 Node 24.13.0 和 pnpm 10.20.0。
- 本仓库独立运行，禁止依赖其他本地仓库、绝对路径或 `@dlab/*`。
- Next.js App Router 与工作台入口放在 `src`；画布功能维护在 `packages/react-flow-pro/src`。
- 应用通过 `@react-flow-pro-example/core` 的公开 exports 使用功能包。
- 浏览器画布在 Client Component 中加载，保持示例按需加载和独立的图状态。
- 共享 React、React DOM 和官方 `@xyflow/react`，禁止引入其他 React Flow 运行时。
- 示例样式以 `.rf-pro-example[data-example]` 隔离；统一样式入口是 `src/styles/index.css`。
- 保留源码说明与依赖归属，源代码不得引用 vendor、recovery 或 artifacts。
- 改动后运行相关类型、lint 与构建检查。
