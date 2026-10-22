/**
 * 撤销与重做：用过去栈和未来栈保存整图快照，在图修改前记录历史。
 * 每个画布实例通过 createExampleScope 创建独立作用域，避免缓存、store 和可变初始数据跨实例共享。
 */
import * as React from 'react'
import {
  useEdgesState,
  useReactFlow,
  useNodesState,
  ReactFlow,
  ReactFlowProvider,
  Panel,
  Controls,
  Background,
  addEdge,
} from '@xyflow/react'
import type { Connection, Edge, Node, NodeOrigin } from '@xyflow/react'

/** 每个历史条目同时保存节点和连线，避免撤销后端点与节点状态不一致。 */
interface GraphSnapshot {
  nodes: HistoryNode[]
  edges: Edge[]
}
type HistoryNode = Node<{ label?: string | undefined }>

/** 创建本示例的组件、算法和局部状态；根组件惰性初始化后在本次挂载中复用。 */
function createExampleScope() {
  const DEFAULT_HISTORY_OPTIONS = {
    maxHistorySize: 100,
    enableShortcuts: true,
  }
  /**
   * 以整张图为单位维护 pastSnapshots 和 futureSnapshots 两个有界历史栈。
   * takeSnapshot 必须在修改前调用：当前图进入过去栈，同时清空无法继续重做的未来分支。
   * 撤销把当前图压入未来栈并恢复过去栈尾；重做反向操作，节点和连线总是一起恢复。
   * 这里的 canUndo/canRedo 沿用原实现，实际表示按钮的 disabled 条件，即对应栈为空。
   * 快捷键监听随配置和回调更新，effect 清理时解除，避免重复触发历史操作。
   */
  const useUndoRedo = ({
    maxHistorySize = DEFAULT_HISTORY_OPTIONS.maxHistorySize,
    enableShortcuts = DEFAULT_HISTORY_OPTIONS.enableShortcuts,
  } = DEFAULT_HISTORY_OPTIONS) => {
    const [pastSnapshots, setPastSnapshots] = React.useState<GraphSnapshot[]>([])
    const [futureSnapshots, setFutureSnapshots] = React.useState<GraphSnapshot[]>([])
    const { setNodes, setEdges, getNodes, getEdges } = useReactFlow<HistoryNode, Edge>()
    const takeSnapshot = React.useCallback(
      /* 在修改画布之前保存当前图，确保撤销能恢复操作发生前的完整状态。 */ () => {
        setPastSnapshots((previousSnapshots) => [
          ...previousSnapshots.slice(
            previousSnapshots.length - maxHistorySize + 1,
            previousSnapshots.length,
          ),
          {
            nodes: getNodes(),
            edges: getEdges(),
          },
        ])
        setFutureSnapshots([])
      },
      [getNodes, getEdges, maxHistorySize],
    )
    const undo = React.useCallback(
      /* 撤销弹出过去栈尾，将当前图压入未来栈，再恢复弹出的快照。 */ () => {
        const snapshotToRestore = pastSnapshots[pastSnapshots.length - 1]
        if (snapshotToRestore) {
          setPastSnapshots((previousSnapshots) =>
            previousSnapshots.slice(0, previousSnapshots.length - 1),
          )
          setFutureSnapshots((previousSnapshots) => [
            ...previousSnapshots,
            {
              nodes: getNodes(),
              edges: getEdges(),
            },
          ])
          setNodes(snapshotToRestore.nodes)
          setEdges(snapshotToRestore.edges)
        }
      },
      [setNodes, setEdges, getNodes, getEdges, pastSnapshots],
    )
    const redo = React.useCallback(
      /* 重做弹出未来栈尾，将当前图压回过去栈，再恢复弹出的快照。 */ () => {
        const snapshotToRestore = futureSnapshots[futureSnapshots.length - 1]
        if (snapshotToRestore) {
          setFutureSnapshots((previousSnapshots) =>
            previousSnapshots.slice(0, previousSnapshots.length - 1),
          )
          setPastSnapshots((previousSnapshots) => [
            ...previousSnapshots,
            {
              nodes: getNodes(),
              edges: getEdges(),
            },
          ])
          setNodes(snapshotToRestore.nodes)
          setEdges(snapshotToRestore.edges)
        }
      },
      [setNodes, setEdges, getNodes, getEdges, futureSnapshots],
    )
    React.useEffect(
      /* 监听 Ctrl/Meta+Z 与 Ctrl/Meta+Shift+Z，分别执行撤销和重做。 */ () => {
        if (!enableShortcuts) {
          return
        }
        const handleHistoryShortcut = (keyboardEvent: KeyboardEvent) => {
          if (
            keyboardEvent.key?.toLowerCase() === 'z' &&
            (keyboardEvent.ctrlKey || keyboardEvent.metaKey) &&
            keyboardEvent.shiftKey
          ) {
            redo()
          } else {
            if (
              keyboardEvent.key?.toLowerCase() === 'z' &&
              (keyboardEvent.ctrlKey || keyboardEvent.metaKey)
            ) {
              undo()
            }
          }
        }
        document.addEventListener('keydown', handleHistoryShortcut)
        return () => {
          document.removeEventListener('keydown', handleHistoryShortcut)
        }
      },
      [undo, redo, enableShortcuts],
    )
    return {
      undo,
      redo,
      takeSnapshot,
      canUndo: !pastSnapshots.length,
      canRedo: !futureSnapshots.length,
    }
  }
  const NODE_WORDS = ['Wire', 'your', 'ideas', 'with', 'React', 'Flow', '!']
  const PRO_OPTIONS = {
    account: 'paid-pro',
    hideAttribution: true,
  }
  const INITIAL_NODES: HistoryNode[] = []
  const INITIAL_EDGES: Edge[] = []
  const NODE_ORIGIN: NodeOrigin = [0.5, 0.5]
  /**
   * 连线、拖动开始、选区拖动开始、删除和空白处新增节点前统一记录快照。
   * 只在拖动开始时记录，避免把每一个鼠标移动位置都压入历史栈。
   * 新增节点先将屏幕点击位置转换为画布坐标，再循环使用 NODE_WORDS 作为标签。
   * 完整图状态由 React Flow 管理，历史 hook 通过 getNodes/getEdges 获取同一份当前数据。
   */
  function UndoRedoFlow() {
    const { undo, redo, canUndo: undoDisabled, canRedo: redoDisabled, takeSnapshot } = useUndoRedo()
    const [nodes, , onNodesChange] = useNodesState(INITIAL_NODES)
    const [edges, setEdges, onEdgesChange] = useEdgesState(INITIAL_EDGES)
    const { screenToFlowPosition, addNodes } = useReactFlow<HistoryNode, Edge>()
    const onConnect = React.useCallback(
      (connection: Connection) => {
        takeSnapshot()
        setEdges((currentEdges) => addEdge(connection, currentEdges))
      },
      [setEdges, takeSnapshot],
    )
    const onPaneClick = React.useCallback(
      (mouseEvent: React.MouseEvent) => {
        takeSnapshot()
        const nodePosition = screenToFlowPosition({
          x: mouseEvent.clientX,
          y: mouseEvent.clientY,
        })
        const nodeLabel = NODE_WORDS.shift()
        addNodes([
          {
            id: `${new Date().getTime()}`,
            data: {
              label: nodeLabel,
            },
            position: nodePosition,
          },
        ])
        NODE_WORDS.push(`${nodeLabel}`)
      },
      [takeSnapshot, addNodes, screenToFlowPosition],
    )
    return (
      <ReactFlow
        defaultViewport={{
          x: 0,
          y: 0,
          zoom: 1.5,
        }}
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        proOptions={PRO_OPTIONS}
        onConnect={onConnect}
        onNodeDragStart={React.useCallback(() => {
          takeSnapshot()
        }, [takeSnapshot])}
        onSelectionDragStart={React.useCallback(() => {
          takeSnapshot()
        }, [takeSnapshot])}
        onNodesDelete={React.useCallback(() => {
          takeSnapshot()
        }, [takeSnapshot])}
        onEdgesDelete={React.useCallback(() => {
          takeSnapshot()
        }, [takeSnapshot])}
        onPaneClick={onPaneClick}
        nodeOrigin={NODE_ORIGIN}
        selectNodesOnDrag={false}
        colorMode="system"
      >
        <Background />
        <Controls />
        <Panel position="top-left" className="panel-description">
          <div>
            <button className="xy-theme__button" disabled={undoDisabled} onClick={undo}>
              <span>{'↺ '}</span>
              {' Undo'}
            </button>
            <button className="xy-theme__button" disabled={redoDisabled} onClick={redo}>
              <span>{'⟳ '}</span>
              {' Redo'}
            </button>
          </div>
          {!nodes.length && <h3>{'Click anywhere on the pane to add nodes.'}</h3>}
        </Panel>
      </ReactFlow>
    )
  }
  function UndoRedoExample(props: Record<string, never>) {
    return (
      <ReactFlowProvider>
        <UndoRedoFlow {...props} />
      </ReactFlowProvider>
    )
  }
  const initialElement = (
    <React.StrictMode>
      <UndoRedoExample />
    </React.StrictMode>
  )
  return function ExampleRoot() {
    return initialElement
  }
}
function UndoRedoCanvas() {
  // 惰性保存组件类型，使普通重渲染沿用同一份图状态；工作台重置时重新挂载。
  const [Example] = React.useState(createExampleScope)
  return <Example />
}
export { UndoRedoCanvas as default }
