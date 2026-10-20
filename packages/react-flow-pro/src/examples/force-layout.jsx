import * as React from 'react'
import { LayoutControlsProvider, LayoutControlsPanel } from '../controls/layout-controls'
import { useLayoutControls } from '../controls/layout-controls-context'
import { createDemoId } from '../runtime/create-id.js'
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
function createExampleScope() {
  const selectTopologySize = (store) => store.nodes.length + store.edges.length
  /* 把画布节点复制成 d3 模拟节点，叠加排斥力、连线弹力与向中心的力；tick 时把模拟坐标写回画布。 */
  function useForceLayout({ strength: chargeStrength = -1e3, distance: linkDistance = 150 }) {
    const topologySize = useStore(selectTopologySize)
    const nodesInitialized = useNodesInitialized()
    const { setNodes, getNodes, getEdges } = useReactFlow()
    const draggedNodeRef = React.useRef(null)
    const simulationNodesRef = React.useRef([])
    const simulationRef = React.useRef(null)
    const dragHandlers = React.useMemo(
      () => ({
        start: /* 拖动开始时记住节点并重新加热模拟。 */ (dragEvent, draggedNode) => {
          draggedNodeRef.current = draggedNode
          simulationRef.current?.alpha(0.3).restart()
        },
        drag: /* 拖动过程中用 fx/fy 固定对应模拟节点，使其它节点继续围绕拖动位置计算。 */ (
          dragEvent,
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
        const simulationNodes = currentNodes.map((inputNode) => ({
          ...inputNode,
          x: inputNode.position.x,
          y: inputNode.position.y,
        }))
        simulationNodesRef.current = simulationNodes
        const simulationLinks = currentEdges.map((inputEdge) => inputEdge)
        const simulation = forceSimulation()
          .nodes(simulationNodes)
          .force('charge', forceManyBody().strength(chargeStrength))
          .force(
            'link',
            forceLink(simulationLinks)
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
  const INITIAL_NODES = [
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
  const INITIAL_EDGES = [
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
  const NODE_ORIGIN = [0.5, 0.5]
  const DEFAULT_EDGE_OPTIONS = {
    type: 'straight',
  }
  const EMOJI_LABELS = ['👍', '👌', '👏', '👋', '🙌']
  const randomEmojiLabel = () => EMOJI_LABELS[~~(Math.random() * (EMOJI_LABELS.length - 1))]
  /* 点击空白区域创建节点；若存在未落到目标的连线则连接新节点；点击已有节点则创建相邻子节点及连线。 */
  function ForceLayoutFlow({ strength: chargeStrength = -1e3, distance: linkDistance = 150 }) {
    const [nodes, setNodes, onNodesChange] = useNodesState(INITIAL_NODES)
    const [edges, setEdges, onEdgesChange] = useEdgesState(INITIAL_EDGES)
    const { screenToFlowPosition } = useReactFlow()
    const dragHandlers = useForceLayout({
      strength: chargeStrength,
      distance: linkDistance,
    })
    const [pendingSourceNodeId, setPendingSourceNodeId] = React.useState(null)
    const onPaneClick = React.useCallback(
      (clickEvent) => {
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
      (connection) => setEdges((currentEdges) => addEdge(connection, currentEdges)),
      [setEdges],
    )
    const onNodeClick = React.useCallback(
      (clickEvent, clickedNode) => {
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
            connectEndEvent,
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
  const [Example] = React.useState(createExampleScope)
  return <Example />
}
export { ForceLayoutCanvas as default }
