# 实现与依赖

本包以 React Flow 官方公开示例的功能与交互分析作为参考，源码位于 `src` 并直接维护。运行时使用项目安装的官方 `@xyflow/react`，不分发捕获版 vendor JavaScript 或专用 React 运行时。

React、React DOM、React Flow 由宿主提供。D3、Dagre、ELK、Leva、Zustand、Yjs、perfect-freehand、perfect-cursors、lucide-react 与 libavoid-js 通过本包声明的 npm 依赖提供，依赖归属和版本见 `package.json`。WASM 资源由安装的 libavoid-js 包提供并交给构建工具处理。

本地协作传输、参数面板集成、图编辑规则、布局协调和宿主工具由本包可读源码实现。本仓库不包含原项目的历史参考归档；构建与运行只使用本仓库源码和声明的 npm 依赖。
