# @react-flow-pro-example/core

基于项目本地安装的官方 `@xyflow/react@12.12.0` 实现的 Pro 功能包。React Flow、React 和 React DOM 由宿主提供；本包不内置另一份 React Flow，也不包含 vendor JavaScript、网页运行时或源码生成步骤。`src` 是直接维护的源码。

## 在项目中使用

根目录 Next.js 应用与本包均使用 `@xyflow/react@12.12.0`，通过 pnpm workspace 共享 React 与 React Flow。本包用 peer dependency 约束版本，Next.js 通过 `transpilePackages` 编译源码。

```tsx
import { DynamicLayoutingExample } from '@react-flow-pro-example/core'

export function Workflow() {
  return (
    <div style={{ height: 640 }}>
      <DynamicLayoutingExample />
    </div>
  )
}
```

工作区应用声明 `"@react-flow-pro-example/core": "workspace:*"`。独立安装使用 `artifacts/react-flow-pro-example-core-0.2.0.tgz`；宿主需要提供官方 React Flow 12.12.0 和相容的 React 19：

```sh
pnpm add ./react-flow-pro-example-core-0.2.0.tgz
```

使用构建包时导入包样式；官方 React Flow 基础 CSS 也通过正常包导入加载：

```tsx
import '@react-flow-pro-example/core/style.css'
import { ProExampleCanvas } from '@react-flow-pro-example/core'

export function Example() {
  return (
    <div style={{ height: 640 }}>
      <ProExampleCanvas example="auto-layout" />
    </div>
  )
}
```

在 Next.js 中请从 Client Component 使用，并通过 `next/dynamic` 的 `ssr: false` 在浏览器加载；完整接入入口见根目录 `src/components/pro-workbench-loader.tsx`。

每个入口包含自己的 React Flow Provider 和图状态。调用方负责提供父容器宽高。已有组件名称、目录 ID 和 `ProExampleCanvas` 的选择方式保持一致。

## 功能入口

| ID                        | 导出组件                       | 功能                                   |
| ------------------------- | ------------------------------ | -------------------------------------- |
| `node-position-animation` | `NodePositionAnimationExample` | 节点位置动画与布局切换                 |
| `shapes`                  | `ShapesExample`                | 图形拖入、文字、颜色、尺寸和连接       |
| `edge-routing`            | `EdgeRoutingExample`           | 正交避障、端口方向与障碍物移动         |
| `editable-edge`           | `EditableEdgeExample`          | 曲线、折线控制点编辑与绘制连接         |
| `helper-lines`            | `HelperLinesExample`           | 拖动、缩放辅助线与吸附                 |
| `collaborative`           | `CollaborativeExample`         | 同源标签页中的图、表单、光标与连接同步 |
| `copy-paste`              | `CopyPasteExample`             | 复制、剪切、粘贴与快捷键               |
| `undo-redo`               | `UndoRedoExample`              | 图快照历史、撤销与重做                 |
| `selection-grouping`      | `SelectionGroupingExample`     | 多选分组、组尺寸与解组                 |
| `parent-child-relation`   | `ParentChildRelationExample`   | 拖入父节点、相对坐标与脱离             |
| `expand-collapse`         | `ExpandCollapseExample`        | 树节点展开、折叠与添加子节点           |
| `auto-layout`             | `AutoLayoutExample`            | Dagre、D3 Hierarchy、ELK 与四方向布局  |
| `force-layout`            | `ForceLayoutExample`           | 力模拟、拖动固定、新节点与连接         |
| `dynamic-layouting`       | `DynamicLayoutingExample`      | 占位节点转换、分支与边中插入           |
| `freehand-draw`           | `FreehandDrawExample`          | 自由绘制、选择、移动和缩放             |

服务端图片生成和远程协作服务器不包含在本项目中。协作使用本地 `BroadcastChannel`，不创建 WebSocket 连接。

## 源码与依赖

```text
src/examples/       15 个功能的组件、hooks、算法组织和初始数据
src/collaboration/ 可读的 Yjs 本地传输
src/controls/      基于 Leva 公共 API 的独立参数面板
src/lib/           基于官方 React Flow API 的几何辅助函数
src/runtime/       兼容 HTTP 环境的 ID 与剪贴板工具
src/styles/        共享主题与各功能样式
```

示例直接使用 `import { ReactFlow, useReactFlow } from '@xyflow/react'`。D3、Dagre、ELK、Leva、Yjs、Zustand、perfect-freehand、perfect-cursors、lucide-react、libavoid-js 都通过正常 npm 包名导入。构建将这些依赖保留为外部依赖，由项目安装和解析；libavoid 的 WASM 文件从安装的 npm 包交给构建工具输出为静态资源。

直接编辑对应的 JSX、TS 或 CSS 文件即可，不需要修改位置映射、运行恢复脚本或维护压缩符号。入口仍用实例工厂隔离可变状态，避免不同画布共享 store、缓存或布局参数。

阅读顺序与维护方法见 [源码指南](./docs/readable-source.md)；各功能的数据流和公式说明见 [功能原理](./docs/pro-features.md)；共享官方依赖的约定见 [架构](./docs/architecture.md)。

## 构建

在工作区根目录使用 Node 24.13.0、pnpm 10.20.0：

```sh
pnpm dev
pnpm pro:build
pnpm pro:pack
```

构建输出到 `dist`，安装包输出到工作区 `artifacts`。构建代码保留可读名称并提供指向当前源码的 source map。构建与运行不依赖原仓库或历史参考资料。
