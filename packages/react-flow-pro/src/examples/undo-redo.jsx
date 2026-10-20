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
function createExampleScope() {
  const DEFAULT_HISTORY_OPTIONS = {
    maxHistorySize: 100,
    enableShortcuts: true,
  }
  /* 用过去栈和未来栈保存整张图的节点、边快照；新操作入栈时清空未来栈，并限制过去栈长度。 */
  const useUndoRedo = ({
    maxHistorySize = DEFAULT_HISTORY_OPTIONS.maxHistorySize,
    enableShortcuts = DEFAULT_HISTORY_OPTIONS.enableShortcuts,
  } = DEFAULT_HISTORY_OPTIONS) => {
    const [pastSnapshots, setPastSnapshots] = React.useState([])
    const [futureSnapshots, setFutureSnapshots] = React.useState([])
    const { setNodes, setEdges, getNodes, getEdges } = useReactFlow()
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
        const handleHistoryShortcut = (keyboardEvent) => {
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
  const INITIAL_NODES = []
  const INITIAL_EDGES = []
  const NODE_ORIGIN = [0.5, 0.5]
  /* 连线、拖动、删除、点击新增节点之前保存快照；canUndo/canRedo 返回的是禁用条件，因此按钮直接使用该值。 */
  function UndoRedoFlow() {
    const { undo, redo, canUndo: undoDisabled, canRedo: redoDisabled, takeSnapshot } = useUndoRedo()
    const [nodes, , onNodesChange] = useNodesState(INITIAL_NODES)
    const [edges, setEdges, onEdgesChange] = useEdgesState(INITIAL_EDGES)
    const { screenToFlowPosition, addNodes } = useReactFlow()
    const onConnect = React.useCallback(
      (connection) => {
        takeSnapshot()
        setEdges((currentEdges) => addEdge(connection, currentEdges))
      },
      [setEdges, takeSnapshot],
    )
    const onPaneClick = React.useCallback(
      (mouseEvent) => {
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
  function UndoRedoExample(props) {
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
  const [Example] = React.useState(createExampleScope)
  return <Example />
}
export { UndoRedoCanvas as default }
