/**
 * 复制、剪切与粘贴：缓存选区内部的图结构，重新生成 ID 并整体平移节点坐标。
 * 每个画布实例通过 createExampleScope 创建独立作用域，避免缓存、store 和可变初始数据跨实例共享。
 */
import * as React from 'react'
import {
  getConnectedEdges,
  useEdgesState,
  useReactFlow,
  useStore,
  useNodesState,
  useKeyPress,
  ReactFlow,
  ReactFlowProvider,
  Panel,
  addEdge,
} from '@xyflow/react'
import type { Connection, Edge, Node } from '@xyflow/react'

/** 缓冲区保存完整节点和连线；粘贴时保留原有 data、样式和选择状态。 */
type ClipboardNode = Node<{ label: string }>

/** 创建本示例的组件、算法和局部状态；根组件惰性初始化后在本次挂载中复用。 */
function createExampleScope() {
  /**
   * 提供当前画布独立的内存剪贴板，缓存完整节点和选区内部连线。
   * 复制、剪切均检查连线两端是否都在选区内，避免粘贴出指向旧节点的跨区连线。
   * 粘贴以缓冲节点的最小 x/y 为基准，将整组选区平移到鼠标所在画布坐标。
   * 同一轮粘贴给节点 ID、边 ID 和边端点追加相同后缀，保持复制后的拓扑一致。
   * 最后清除原图选择状态，鼠标位置监听在画布 DOM 卸载时解除。
   */
  function useCopyPaste() {
    const pointerPositionRef = React.useRef({
      x: 0,
      y: 0,
    })
    const flowDomNode = useStore((flowState) => flowState.domNode)
    const { getNodes, setNodes, getEdges, setEdges, screenToFlowPosition } = useReactFlow<
      ClipboardNode,
      Edge
    >()
    const [bufferedNodes, setBufferedNodes] = React.useState<ClipboardNode[]>([])
    const [bufferedEdges, setBufferedEdges] = React.useState<Edge[]>([])
    React.useEffect(() => {
      const clipboardEventTypes = ['cut', 'copy', 'paste']
      if (flowDomNode) {
        const preventClipboardDefault = (clipboardEvent: Event) => clipboardEvent.preventDefault()
        const trackPointerPosition = (mouseEvent: MouseEvent) => {
          pointerPositionRef.current = {
            x: mouseEvent.clientX,
            y: mouseEvent.clientY,
          }
        }
        flowDomNode.addEventListener('mousemove', trackPointerPosition)
        return () => {
          for (const eventType of clipboardEventTypes)
            flowDomNode.removeEventListener(eventType, preventClipboardDefault)
          flowDomNode.removeEventListener('mousemove', trackPointerPosition)
        }
      }
    }, [flowDomNode])
    const copy = React.useCallback(
      /* 复制仅记录节点和内部连线，跨越选区边界的连线不会进入缓冲区。 */ () => {
        const selectedNodes = getNodes().filter((node) => node.selected)
        const internalEdges = getConnectedEdges(selectedNodes, getEdges()).filter((edge) => {
          const sourceOutsideSelection = selectedNodes.every(
            (selectedNode) => selectedNode.id !== edge.source,
          )
          const targetOutsideSelection = selectedNodes.every(
            (selectedNode) => selectedNode.id !== edge.target,
          )
          return !(sourceOutsideSelection || targetOutsideSelection)
        })
        setBufferedNodes(selectedNodes)
        setBufferedEdges(internalEdges)
      },
      [getNodes, getEdges],
    )
    const cut = React.useCallback(
      /* 剪切先写入缓冲区，再删除选中节点及其内部连线。 */ () => {
        const selectedNodes = getNodes().filter((node) => node.selected)
        const internalEdges = getConnectedEdges(selectedNodes, getEdges()).filter((edge) => {
          const sourceOutsideSelection = selectedNodes.every(
            (selectedNode) => selectedNode.id !== edge.source,
          )
          const targetOutsideSelection = selectedNodes.every(
            (selectedNode) => selectedNode.id !== edge.target,
          )
          return !(sourceOutsideSelection || targetOutsideSelection)
        })
        setBufferedNodes(selectedNodes)
        setBufferedEdges(internalEdges)
        setNodes((currentNodes) => currentNodes.filter((node) => !node.selected))
        setEdges((currentEdges) => currentEdges.filter((edge) => !internalEdges.includes(edge)))
      },
      [getNodes, setNodes, getEdges, setEdges],
    )
    const paste = React.useCallback(
      /* 以选区左上角为基准保持节点间距，并给节点、边及边端点追加同一时间戳以维持连接关系。 */ (
        { x: pasteX, y: pasteY } = screenToFlowPosition({
          x: pointerPositionRef.current.x,
          y: pointerPositionRef.current.y,
        }),
      ) => {
        const selectionLeft = Math.min(
          ...bufferedNodes.map((bufferedNode) => bufferedNode.position.x),
        )
        const selectionTop = Math.min(
          ...bufferedNodes.map((bufferedNode) => bufferedNode.position.y),
        )
        const idSuffix = Date.now()
        const pastedNodes = bufferedNodes.map((bufferedNode) => {
          const pastedNodeId = `${bufferedNode.id}-${idSuffix}`
          const nodeX = pasteX + (bufferedNode.position.x - selectionLeft)
          const nodeY = pasteY + (bufferedNode.position.y - selectionTop)
          return {
            ...bufferedNode,
            id: pastedNodeId,
            position: {
              x: nodeX,
              y: nodeY,
            },
          }
        })
        const pastedEdges = bufferedEdges.map((bufferedEdge) => {
          const pastedEdgeId = `${bufferedEdge.id}-${idSuffix}`
          const pastedSourceId = `${bufferedEdge.source}-${idSuffix}`
          const pastedTargetId = `${bufferedEdge.target}-${idSuffix}`
          return {
            ...bufferedEdge,
            id: pastedEdgeId,
            source: pastedSourceId,
            target: pastedTargetId,
          }
        })
        setNodes((currentNodes) => [
          ...currentNodes.map((node) => ({
            ...node,
            selected: false,
          })),
          ...pastedNodes,
        ])
        setEdges((currentEdges) => [
          ...currentEdges.map((edge) => ({
            ...edge,
            selected: false,
          })),
          ...pastedEdges,
        ])
      },
      [bufferedNodes, bufferedEdges, screenToFlowPosition, setNodes, setEdges],
    )
    useShortcut(['Meta+x', 'Control+x'], cut)
    useShortcut(['Meta+c', 'Control+c'], copy, true)
    useShortcut(['Meta+v', 'Control+v'], paste)
    return {
      cut,
      copy,
      paste,
      bufferedNodes,
      bufferedEdges,
    }
  }
  /**
   * 把组合键的持续按下状态转换为一次操作，避免按住键时反复复制或粘贴。
   * wasPressed 记录上一轮状态，只有从未按下变成按下时才执行回调。
   * 输入框中的修饰键交给 useKeyPress 处理；复制遇到文字选区时保留文字复制。
   * 各快捷键和工具栏按钮复用同一组 cut/copy/paste 操作，保证行为一致。
   */
  function useShortcut(
    keyCombinations: string[],
    executeShortcut: () => void,
    preserveTextSelection = false,
  ) {
    const [wasPressed, setWasPressed] = React.useState(false)
    const isPressed = useKeyPress(keyCombinations, {
      actInsideInputWithModifier: false,
      preventDefault: false,
    })
    React.useEffect(() => {
      const selectedText = window.getSelection()?.toString()
      if (isPressed && !wasPressed && (!preserveTextSelection || !selectedText)) {
        executeShortcut()
        setWasPressed(true)
      } else {
        setWasPressed(isPressed)
      }
    }, [isPressed, wasPressed, executeShortcut, preserveTextSelection])
  }
  const INITIAL_NODES: ClipboardNode[] = [
    {
      id: 'a',
      data: {
        label: 'A',
      },
      position: {
        x: 0,
        y: 0,
      },
    },
    {
      id: 'b',
      data: {
        label: 'B',
      },
      position: {
        x: 0,
        y: 100,
      },
    },
    {
      id: 'c',
      data: {
        label: 'C',
      },
      position: {
        x: 0,
        y: 200,
      },
    },
  ]
  const INITIAL_EDGES: Edge[] = [
    {
      id: 'a->b',
      source: 'a',
      target: 'b',
    },
    {
      id: 'b->c',
      source: 'b',
      target: 'c',
    },
  ]
  /**
   * 节点与连线使用 React Flow 的受控状态；连接事件只追加一条边。
   * 工具栏根据选区和内存缓冲区决定按钮是否可用；按钮粘贴落在画布原点。
   * 快捷键粘贴则使用鼠标位置，由 useCopyPaste 负责屏幕到画布坐标转换。
   */
  function CopyPasteFlow() {
    const [nodes, , onNodesChange] = useNodesState(INITIAL_NODES)
    const [edges, setEdges, onEdgesChange] = useEdgesState(INITIAL_EDGES)
    const onConnect = React.useCallback(
      (connection: Connection) => {
        setEdges((currentEdges) => addEdge(connection, currentEdges))
      },
      [setEdges],
    )
    const { cut, copy, paste, bufferedNodes } = useCopyPaste()
    const hasSelectedNodes = nodes.some(({ selected }) => selected)
    const hasBufferedNodes = bufferedNodes.length > 0
    return (
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        fitView
        colorMode="system"
      >
        <Panel position="top-left">
          <button className="xy-theme__button" onClick={() => cut()} disabled={!hasSelectedNodes}>
            {'✂️ Cut'}
          </button>
          <button className="xy-theme__button" onClick={() => copy()} disabled={!hasSelectedNodes}>
            {'📋 Copy'}
          </button>
          <button
            className="xy-theme__button"
            onClick={() =>
              paste({
                x: 0,
                y: 0,
              })
            }
            disabled={!hasBufferedNodes}
          >
            {'📌 Paste'}
          </button>
        </Panel>
      </ReactFlow>
    )
  }
  const _ExampleContent = () => (
    <ReactFlowProvider>
      <CopyPasteFlow />
    </ReactFlowProvider>
  )
  const initialElement = (
    <React.StrictMode>
      <_ExampleContent />
    </React.StrictMode>
  )
  return function ExampleRoot() {
    return initialElement
  }
}
function CopyPasteCanvas() {
  // 惰性保存组件类型，使普通重渲染沿用同一份图状态；工作台重置时重新挂载。
  const [Example] = React.useState(createExampleScope)
  return <Example />
}
export { CopyPasteCanvas as default }
