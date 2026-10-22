/**
 * 节点位置动画：切换布局目标，用定时器逐帧插值生成画布中的实际显示位置。
 * 每个画布实例通过 createExampleScope 创建独立作用域，避免缓存、store 和可变初始数据跨实例共享。
 */
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
import type { Edge, Node, NodeChange, EdgeChange, XYPosition } from '@xyflow/react'

/** 布局表以节点 ID 索引目标坐标，节点数据只承载显示标签。 */
type AnimatedNode = Node<{ label: string }>

/** 创建本示例的组件、算法和局部状态；根组件惰性初始化后在本次挂载中复用。 */
function createExampleScope() {
  const INITIAL_NODES: AnimatedNode[] = [
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
  const LAYOUT_POSITIONS: Record<string, XYPosition>[] = [
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
  /**
   * 把目标节点转换为每一帧显示的节点列表。输入数组保存最终布局，返回数组保存插值位置。
   * 起点通过 getNode 读取画布当前坐标，因此连续切换布局时可以从当前显示位置继续。
   * D3 定时器提供经过毫秒数：progress = elapsed / duration，再分别插值 x、y。
   * 超过持续时间后写回完整目标数组，消除浮点误差，并停止本轮定时器。
   * @param targetNodes 切换布局后期望到达的节点及数据。
   * animationDuration 为单次插值时长，单位为毫秒。
   */
  function useAnimatedNodes(targetNodes: AnimatedNode[], { animationDuration = 300 } = {}) {
    const [animatedNodes, setAnimatedNodes] = React.useState(targetNodes)
    const { getNode } = useReactFlow<AnimatedNode, Edge>()
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
  /**
   * 布局切换只更新目标坐标；ReactFlow 渲染 useAnimatedNodes 的逐帧输出。
   * 节点禁止手动拖动和连接，使布局表成为本示例唯一的位置来源。
   * 布局序号放入 ref，不触发额外渲染；节点 ID 与两套布局表的键一一对应。
   */
  function NodePositionAnimationFlow() {
    const layoutIndexRef = React.useRef(0)
    const [nodes, setNodes] = React.useState(INITIAL_NODES)
    const [edges, setEdges] = React.useState<Edge[]>([])
    const animatedNodes = useAnimatedNodes(nodes, {
      animationDuration: 300,
    })
    const onNodesChange = React.useCallback(
      (nodeChanges: NodeChange<AnimatedNode>[]) =>
        setNodes((currentNodes) => applyNodeChanges(nodeChanges, currentNodes)),
      [],
    )
    const onEdgesChange = React.useCallback(
      (edgeChanges: EdgeChange<Edge>[]) =>
        setEdges((currentEdges) => applyEdgeChanges(edgeChanges, currentEdges)),
      [],
    )
    const toggleLayout = React.useCallback(() => {
      layoutIndexRef.current = (layoutIndexRef.current + 1) % LAYOUT_POSITIONS.length
      const nextLayoutPositions = LAYOUT_POSITIONS[layoutIndexRef.current]!
      setNodes((currentNodes) =>
        currentNodes.map((currentNode) => {
          const nextPosition = nextLayoutPositions[currentNode.id]!
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
  // 惰性保存组件类型，使普通重渲染沿用同一份图状态；工作台重置时重新挂载。
  const [Example] = React.useState(createExampleScope)
  return <Example />
}
export { NodePositionAnimationCanvas as default }
