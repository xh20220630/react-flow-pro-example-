# 源码阅读与维护

当前代码直接维护在 `src`，不再从网页脚本生成。所有 React Flow 组件与 hooks 都从项目安装的官方 `@xyflow/react` 导入；第三方算法使用正常 npm 包导入。本包没有 `vendor` 目录或专有的 React Flow 运行时。

## 从功能入口开始

`src/pro-example-canvas.tsx` 根据 `ProExampleId` 按需加载功能组件；样式由 `src/styles/index.css` 统一引入，保留统一的搜索、导航、重置接入方式。每个功能位于 `src/examples/<id>.jsx`。

先读文件末尾的 Canvas 组件，再进入 `createExampleScope()` 返回的组件树。这个工厂通过 `React.useState(createExampleScope)` 每次挂载只创建一次，作用是让 store、缓存、初始数据及节点组件属于当前画布。宿主普通重渲染继续使用同一份实例；重挂载才建立新状态。

以 `dynamic-layouting.jsx` 为例：

1. `PlaceholderNode` 的点击事件调用 `useActivatePlaceholder`。
2. 该函数把占位节点改成工作流节点，并追加新的占位节点和连接。
3. 节点数量变化触发 `useWorkflowLayout`。
4. `layoutWorkflowTree` 使用 D3 的 `stratify` 与 `tree` 计算目标坐标。
5. 动画定时器根据 `elapsedMilliseconds` 计算 `progress`，更新节点位置，最后写回准确目标。

同一模块里的 `useAddWorkflowChild`、`useInsertWorkflowNode` 分别实现子分支和边中插入。全部通过官方 `useReactFlow()` 操作当前 Provider 中的图。

## 关键模块

| 模块                                               | 优先阅读                                                                       |
| -------------------------------------------------- | ------------------------------------------------------------------------------ |
| [动态树](../src/examples/dynamic-layouting.jsx)    | `layoutWorkflowTree`、`useWorkflowLayout`、三个图结构操作 hook                 |
| [自动布局](../src/examples/auto-layout.jsx)        | `layoutWithDagre`、`layoutWithHierarchy`、`LAYOUT_ALGORITHMS`、`useAutoLayout` |
| [力布局](../src/examples/force-layout.jsx)         | `useForceLayout` 的 simulation、tick 与拖动处理                                |
| [辅助线](../src/examples/helper-lines.jsx)         | 锚线索引、候选筛选、`applySnap` 与 change 合并                                 |
| [可编辑边](../src/examples/editable-edge.jsx)      | 路径算法、控制点、`EditableEdge` 和连接草稿                                    |
| [分组](../src/examples/selection-grouping.jsx)     | 组边界、父子坐标变换、`fitGroups` 与解组                                       |
| [协作](../src/examples/collaborative.jsx)          | store 切片、`RemoteProjectionCache`、`YjsBindings`                             |
| [本地传输](../src/collaboration/local-provider.ts) | 首轮状态交换、增量广播、origin 防回环与销毁                                    |
| [参数面板](../src/controls/layout-controls.tsx)    | 公共 Leva store、Provider 和 Panel                                             |

其余模块按相同结构组织：初始数据、算法和 hooks、节点/边组件、画布事件。涉及几何公式、坐标转换和状态边界的位置保留了中文说明。

## 如何修改

直接修改实现文件，修改布局算法就编辑相应函数，修改交互就编辑事件处理或 hook，修改外观就编辑 `src/styles`。不需要维护原脚本字符位置或符号映射。新增包依赖必须声明到本包 `package.json`，使用公开导出；不能从历史参考目录、压缩资源或另一个包的内部路径导入。

React Flow 版本由宿主决定，当前工作区统一为 12.12.0。升级时同时调整根目录应用和本包的 peer/dev 版本，继续使用官方入口，避免私有构建和多份 Provider 上下文。

完整执行链和边界见 [功能原理](./pro-features.md)；依赖、样式、WASM 和打包约定见 [架构](./architecture.md)。
