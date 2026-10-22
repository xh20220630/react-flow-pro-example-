/**
 * 力导向布局：D3 模拟节点排斥与连线牵引，拖动时固定节点，结束后继续迭代。
 * 每个画布实例通过 createExampleScope 创建独立作用域，避免缓存、store 和可变初始数据跨实例共享。
 */
import * as React from 'react'
import { LayoutControlsProvider, LayoutControlsPanel } from '../controls/layout-controls'
import { useLayoutControls } from '../controls/layout-controls-context'
import { createDemoId } from '../runtime/create-id'
import {
  useEdgesState,
  useReactFlow,
  useStore,
  useNodesInitialized,
  useNodesState,
  ReactFlow,
  ReactFlowProvider,
  Panel,
  Background,
  addEdge,
} from '@xyflow/react'
import { forceLink, forceSimulation, forceX, forceManyBody, forceY } from 'd3-force'
import type { Connection, Edge, Node, NodeOrigin, OnNodeDrag, ReactFlowState } from '@xyflow/react'
import type { Simulation, SimulationNodeDatum, SimulationLinkDatum } from 'd3-force'

/** D3 在节点副本上写入速度与固定位置，画布自身保留 React Flow 的 position。 */
type ForceNode = Node<{ label: string }>
type SimulatedNode = ForceNode & SimulationNodeDatum
interface ForceOptions {
  strength?: number
  distance?: number
}

/** 创建本示例的组件、算法和局部状态；根组件惰性初始化后在本次挂载中复用。 */
function createExampleScope() {
  const selectTopologySize = (store: ReactFlowState) => store.nodes.length + store.edges.length
  /**
   * 把 React Flow 节点复制为 D3 模拟节点，在副本上维护速度、坐标和 fx/fy 固定位置。
   * 组合多体排斥力、边连接弹力和 x/y 向心力，tick 时只把位置写回当前画布。
   * 开始拖动时加热模拟，拖动中固定对应模拟节点，停止后释放固定坐标并继续计算。
   * 节点或边数量、力参数或节点测量状态变化时重建模拟；effect 清理停止旧模拟。
   * chargeStrength 是排斥力强度，负值表示排斥。
   * linkDistance 是连线的期望长度，使用画布坐标单位。
   */
  function useForceLayout({
    strength: chargeStrength = -1e3,
    distance: linkDistance = 150,
  }: ForceOptions) {
    const topologySize = useStore(selectTopologySize)
    const nodesInitialized = useNodesInitialized()
    const { setNodes, getNodes, getEdges } = useReactFlow<ForceNode, Edge>()
    const draggedNodeRef = React.useRef<ForceNode | null>(null)
    const simulationNodesRef = React.useRef<SimulatedNode[]>([])
    const simulationRef = React.useRef<Simulation<
      SimulatedNode,
      SimulationLinkDatum<SimulatedNode>
    > | null>(null)
    const dragHandlers = React.useMemo<{
      start: OnNodeDrag<ForceNode>
      drag: OnNodeDrag<ForceNode>
      stop: () => void
    }>(
      () => ({
        start: /* 拖动开始时记住节点并重新加热模拟。 */ (_dragEvent, draggedNode) => {
          draggedNodeRef.current = draggedNode
          simulationRef.current?.alpha(0.3).restart()
        },
        drag: /* 拖动过程中用 fx/fy 固定对应模拟节点，使其它节点继续围绕拖动位置计算。 */ (
          _dragEvent,
          draggedNode,
        ) => {
          draggedNodeRef.current = draggedNode
          const draggedSimulationNode = simulationNodesRef.current.find(
            (simulationNode) => simulationNode.id === draggedNode.id,
          )
          if (draggedSimulationNode) {
            draggedSimulationNode.fx = draggedNode.position.x
            draggedSimulationNode.fy = draggedNode.position.y
          }
          if (simulationRef.current) {
            simulationRef.current.alpha(0.3).restart()
          }
        },
        stop: () => {
          if (draggedNodeRef.current) {
            const draggedSimulationNode = simulationNodesRef.current.find(
              (simulationNode) => simulationNode.id === draggedNodeRef.current?.id,
            )
            if (draggedSimulationNode) {
              delete draggedSimulationNode.fx
              delete draggedSimulationNode.fy
            }
          }
          draggedNodeRef.current = null
          simulationRef.current?.alpha(1).restart()
        },
      }),
      [],
    )
    React.useEffect(
      /* 拓扑、力参数或初始化状态变化时重建模拟；拖动节点保留画布坐标，非拖动节点使用模拟结果，清理时停止旧模拟。 */ () => {
        const currentNodes = getNodes()
        const currentEdges = getEdges()
        if (!currentNodes.length || !nodesInitialized) {
          return
        }
        const simulationNodes: SimulatedNode[] = currentNodes.map((inputNode) => ({
          ...inputNode,
          x: inputNode.position.x,
          y: inputNode.position.y,
        }))
        simulationNodesRef.current = simulationNodes
        const simulationLinks = currentEdges.map((inputEdge) => inputEdge)
        const simulation = forceSimulation<SimulatedNode>()
          .nodes(simulationNodes)
          .force('charge', forceManyBody().strength(chargeStrength))
          .force(
            'link',
            forceLink<SimulatedNode, SimulationLinkDatum<SimulatedNode>>(simulationLinks)
              .id((simulationNode) => simulationNode.id)
              .strength(0.05)
              .distance(linkDistance),
          )
          .force('x', forceX().x(0).strength(0.08))
          .force('y', forceY().y(0).strength(0.08))
          .on('tick', () => {
            setNodes((latestNodes) =>
              latestNodes.map((latestNode, nodeIndex) => {
                if (simulationNodes[nodeIndex]) {
                  const { x: simulatedX, y: simulatedY } = simulationNodes[nodeIndex]
                  if (draggedNodeRef.current?.id === latestNode.id) {
                    simulationNodes[nodeIndex].fx = latestNode.position.x
                    simulationNodes[nodeIndex].fy = latestNode.position.y
                    return latestNode
                  } else {
                    delete simulationNodes[nodeIndex].fx
                    delete simulationNodes[nodeIndex].fy
                    return {
                      ...latestNode,
                      position: {
                        x: simulatedX ?? 0,
                        y: simulatedY ?? 0,
                      },
                    }
                  }
                }
                return latestNode
              }),
            )
          })
        simulationRef.current = simulation
        return () => {
          simulation.stop()
        }
      },
      [topologySize, getNodes, getEdges, setNodes, chargeStrength, linkDistance, nodesInitialized],
    )
    return dragHandlers
  }
  const INITIAL_NODES: ForceNode[] = [
    {
      id: '1',
      position: {
        x: 0,
        y: 0,
      },
      data: {
        label: '👍',
      },
    },
    {
      id: '2',
      position: {
        x: 10,
        y: 10,
      },
      data: {
        label: '👌',
      },
    },
    {
      id: '3',
      position: {
        x: -10,
        y: -10,
      },
      data: {
        label: '👏',
      },
    },
    {
      id: '4',
      position: {
        x: -10,
        y: 10,
      },
      data: {
        label: '👋',
      },
    },
    {
      id: '5',
      position: {
        x: 10,
        y: -10,
      },
      data: {
        label: '🙌',
      },
    },
  ]
  const INITIAL_EDGES: Edge[] = [
    {
      id: '1->2',
      source: '1',
      target: '2',
    },
    {
      id: '1->3',
      source: '1',
      target: '3',
    },
    {
      id: '1->4',
      source: '1',
      target: '4',
    },
    {
      id: '1->5',
      source: '1',
      target: '5',
    },
  ]
  const PRO_OPTIONS = {
    account: 'paid-pro',
    hideAttribution: true,
  }
  const NODE_ORIGIN: NodeOrigin = [0.5, 0.5]
  const DEFAULT_EDGE_OPTIONS = {
    type: 'straight',
  }
  const EMOJI_LABELS = ['👍', '👌', '👏', '👋', '🙌']
  const randomEmojiLabel = () => EMOJI_LABELS[~~(Math.random() * (EMOJI_LABELS.length - 1))]!
  /**
   * 受控节点/连线与力模拟共享同一 Provider，新增图元素会触发下一轮模拟初始化。
   * 空白点击新增节点；若上次连接没有落到目标，暂存的 source ID 会连接到本次新节点。
   * 点击已有节点则在其附近追加子节点和连线，初始位置仅用于模拟启动。
   * 拖动事件交给 useForceLayout，保持用户直接操作与模拟位置更新协调。
   */
  function ForceLayoutFlow({
    strength: chargeStrength = -1e3,
    distance: linkDistance = 150,
  }: ForceOptions) {
    const [nodes, setNodes, onNodesChange] = useNodesState(INITIAL_NODES)
    const [edges, setEdges, onEdgesChange] = useEdgesState(INITIAL_EDGES)
    const { screenToFlowPosition } = useReactFlow<ForceNode, Edge>()
    const dragHandlers = useForceLayout({
      strength: chargeStrength,
      distance: linkDistance,
    })
    const [pendingSourceNodeId, setPendingSourceNodeId] = React.useState<string | null>(null)
    const onPaneClick = React.useCallback(
      (clickEvent: React.MouseEvent) => {
        const newNodePosition = screenToFlowPosition({
          x: clickEvent.clientX,
          y: clickEvent.clientY,
        })
        let newNodeId = ''
        setNodes((currentNodes) => {
          newNodeId = `${currentNodes.length + 1}`
          return [
            ...currentNodes,
            {
              id: newNodeId,
              position: newNodePosition,
              data: {
                label: randomEmojiLabel(),
              },
            },
          ]
        })
        setEdges((currentEdges) => {
          if (pendingSourceNodeId !== null) {
            const connectedEdges = addEdge(
              {
                id: `${pendingSourceNodeId}-->${newNodeId}`,
                source: pendingSourceNodeId,
                target: newNodeId,
              },
              currentEdges,
            )
            setPendingSourceNodeId(null)
            return connectedEdges
          }
          return currentEdges
        })
      },
      [screenToFlowPosition, setNodes, pendingSourceNodeId],
    )
    const onConnect = React.useCallback(
      (connection: Connection) => setEdges((currentEdges) => addEdge(connection, currentEdges)),
      [setEdges],
    )
    const onNodeClick = React.useCallback(
      (_clickEvent: React.MouseEvent, clickedNode: ForceNode) => {
        const childNodeId = createDemoId()
        const childNode = {
          id: childNodeId,
          position: {
            x: clickedNode.position.x + 100,
            y: clickedNode.position.y + 100,
          },
          data: {
            label: randomEmojiLabel(),
          },
        }
        const parentToChildEdge = {
          id: `${clickedNode.id}->${childNodeId}`,
          source: clickedNode.id,
          target: childNodeId,
        }
        setNodes((currentNodes) => [...currentNodes, childNode])
        setEdges((currentEdges) => [...currentEdges, parentToChildEdge])
      },
      [setNodes, setEdges],
    )
    return (
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectEnd={React.useCallback(
          /* 连接结束且没有目标节点时暂存起点 id，供下一次点击画布创建节点后连线。 */ (
            _connectEndEvent,
            { toNode: targetNode, fromNode: sourceNode },
          ) => {
            if (!targetNode && sourceNode) {
              setPendingSourceNodeId(sourceNode.id)
            }
          },
          [],
        )}
        proOptions={PRO_OPTIONS}
        onPaneClick={onPaneClick}
        nodeOrigin={NODE_ORIGIN}
        onNodeClick={onNodeClick}
        onNodeDragStart={dragHandlers.start}
        onNodeDrag={dragHandlers.drag}
        onNodeDragStop={dragHandlers.stop}
        defaultEdgeOptions={DEFAULT_EDGE_OPTIONS}
        minZoom={0.25}
        fitView
        colorMode="system"
      >
        <LayoutControlsPanel />
        <Panel position="top-left" className="panel-description">
          <b>{'How to use:'}</b>
          {' Click anywhere on the panel to add nodes, click a node to add a connection'}
        </Panel>
        <Background />
      </ReactFlow>
    )
  }
  function ForceLayoutExample() {
    return (
      <ReactFlowProvider>
        <ForceLayoutFlow
          {...useLayoutControls({
            strength: {
              value: -1e3,
              min: -2e3,
              max: 0,
            },
            distance: {
              value: 150,
              min: 0,
              max: 1e3,
            },
          })}
        />
      </ReactFlowProvider>
    )
  }
  const initialElement = (
    <LayoutControlsProvider>
      {
        <React.StrictMode>
          <ForceLayoutExample />
        </React.StrictMode>
      }
    </LayoutControlsProvider>
  )
  return function ExampleRoot() {
    return initialElement
  }
}
function ForceLayoutCanvas() {
  // 惰性保存组件类型，使普通重渲染沿用同一份图状态；工作台重置时重新挂载。
  const [Example] = React.useState(createExampleScope)
  return <Example />
}
export { ForceLayoutCanvas as default }
