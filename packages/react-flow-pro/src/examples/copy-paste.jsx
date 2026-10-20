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
function createExampleScope() {
  /* 缓存选中节点与两端都位于选区内的边；粘贴时统一更新 ID，并以鼠标所在画布坐标平移整个选区。 */
  function useCopyPaste() {
    const pointerPositionRef = React.useRef({
      x: 0,
      y: 0,
    })
    const flowDomNode = useStore((flowState) => flowState.domNode)
    const { getNodes, setNodes, getEdges, setEdges, screenToFlowPosition } = useReactFlow()
    const [bufferedNodes, setBufferedNodes] = React.useState([])
    const [bufferedEdges, setBufferedEdges] = React.useState([])
    React.useEffect(() => {
      const clipboardEventTypes = ['cut', 'copy', 'paste']
      if (flowDomNode) {
        const preventClipboardDefault = (clipboardEvent) => clipboardEvent.preventDefault()
        const trackPointerPosition = (mouseEvent) => {
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
  /* 组合键只在按下沿触发一次；复制快捷键遇到浏览器文字选区时保留文字复制行为。 */
  function useShortcut(keyCombinations, executeShortcut, preserveTextSelection = false) {
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
  const INITIAL_NODES = [
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
  const INITIAL_EDGES = [
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
  function CopyPasteFlow() {
    const [nodes, , onNodesChange] = useNodesState(INITIAL_NODES)
    const [edges, setEdges, onEdgesChange] = useEdgesState(INITIAL_EDGES)
    const onConnect = React.useCallback(
      (connection) => {
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
  const [Example] = React.useState(createExampleScope)
  return <Example />
}
export { CopyPasteCanvas as default }
