import * as React from 'react'
import { timer as createAnimationTimer } from 'd3-timer'
import {
  useReactFlow,
  ReactFlow,
  applyNodeChanges,
  Controls,
  ReactFlowProvider,
  Panel,
  MiniMap,
  Background,
  applyEdgeChanges,
} from '@xyflow/react'
function createExampleScope() {
  const INITIAL_NODES = [
    {
      id: 'A',
      position: {
        x: 0,
        y: 0,
      },
      data: {
        label: 'A',
      },
    },
    {
      id: 'B',
      position: {
        x: -150,
        y: 100,
      },
      data: {
        label: 'B',
      },
    },
    {
      id: 'C',
      position: {
        x: 150,
        y: 100,
      },
      data: {
        label: 'C',
      },
    },
    {
      id: 'D',
      position: {
        x: -300,
        y: 200,
      },
      data: {
        label: 'D',
      },
    },
    {
      id: 'E',
      position: {
        x: 300,
        y: 200,
      },
      data: {
        label: 'E',
      },
    },
  ]
  const LAYOUT_POSITIONS = [
    {
      A: {
        x: 0,
        y: 0,
      },
      B: {
        x: -150,
        y: 100,
      },
      C: {
        x: 150,
        y: 100,
      },
      D: {
        x: -300,
        y: 200,
      },
      E: {
        x: 300,
        y: 200,
      },
    },
    {
      A: {
        x: 0,
        y: 0,
      },
      B: {
        x: 0,
        y: 50,
      },
      C: {
        x: 0,
        y: 100,
      },
      D: {
        x: 0,
        y: 150,
      },
      E: {
        x: 0,
        y: 200,
      },
    },
  ]
  /* 以当前画布位置为起点、目标节点位置为终点；定时器按经过时间线性插值，结束后写回精确目标并停止。 */
  function useAnimatedNodes(targetNodes, { animationDuration = 300 } = {}) {
    const [animatedNodes, setAnimatedNodes] = React.useState(targetNodes)
    const { getNode } = useReactFlow()
    React.useEffect(() => {
      const nodeTransitions = targetNodes.map((targetNode) => ({
        id: targetNode.id,
        from: getNode(targetNode.id)?.position ?? targetNode.position,
        to: targetNode.position,
        node: targetNode,
      }))
      const animationTimer = createAnimationTimer((elapsedMilliseconds) => {
        const progress = elapsedMilliseconds / animationDuration
        console.log('progress', progress)
        setAnimatedNodes(
          nodeTransitions.map(({ node: transitionNode, from: fromPosition, to: toPosition }) => ({
            ...transitionNode,
            position: {
              x: fromPosition.x + (toPosition.x - fromPosition.x) * progress,
              y: fromPosition.y + (toPosition.y - fromPosition.y) * progress,
            },
          })),
        )
        if (elapsedMilliseconds > animationDuration) {
          setAnimatedNodes(targetNodes)
          animationTimer.stop()
        }
      })
    }, [targetNodes, getNode, animationDuration])
    return animatedNodes
  }
  const PRO_OPTIONS = {
    account: 'paid-pro',
    hideAttribution: true,
  }
  /* 保存当前布局序号；切换时只更新目标位置，实际显示的节点由动画 hook 逐帧生成。 */
  function NodePositionAnimationFlow() {
    const layoutIndexRef = React.useRef(0)
    const [nodes, setNodes] = React.useState(INITIAL_NODES)
    const [edges, setEdges] = React.useState([])
    const animatedNodes = useAnimatedNodes(nodes, {
      animationDuration: 300,
    })
    const onNodesChange = React.useCallback(
      (nodeChanges) => setNodes((currentNodes) => applyNodeChanges(nodeChanges, currentNodes)),
      [],
    )
    const onEdgesChange = React.useCallback(
      (edgeChanges) => setEdges((currentEdges) => applyEdgeChanges(edgeChanges, currentEdges)),
      [],
    )
    const toggleLayout = React.useCallback(() => {
      layoutIndexRef.current = (layoutIndexRef.current + 1) % LAYOUT_POSITIONS.length
      const nextLayoutPositions = LAYOUT_POSITIONS[layoutIndexRef.current]
      setNodes((currentNodes) =>
        currentNodes.map((currentNode) => {
          const nextPosition = nextLayoutPositions[currentNode.id]
          return {
            ...currentNode,
            position: nextPosition,
          }
        }),
      )
    }, [])
    return (
      <ReactFlow
        fitView
        nodes={animatedNodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        proOptions={PRO_OPTIONS}
        nodesDraggable={false}
        nodesConnectable={false}
        zoomOnDoubleClick={false}
        elementsSelectable={false}
        colorMode="system"
      >
        <Background />
        <Controls />
        <MiniMap />
        <Panel>
          <button className="xy-theme__button" onClick={toggleLayout}>
            {'toggle layout'}
          </button>
        </Panel>
      </ReactFlow>
    )
  }
  function NodePositionAnimationExample() {
    return (
      <ReactFlowProvider>
        <NodePositionAnimationFlow />
      </ReactFlowProvider>
    )
  }
  const initialElement = (
    <React.StrictMode>
      <NodePositionAnimationExample />
    </React.StrictMode>
  )
  return function ExampleRoot() {
    return initialElement
  }
}
function NodePositionAnimationCanvas() {
  const [Example] = React.useState(createExampleScope)
  return <Example />
}
export { NodePositionAnimationCanvas as default }
