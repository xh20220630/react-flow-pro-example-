import * as React from 'react'
import {
  getSmoothStepPath,
  Position,
  useEdgesState,
  useReactFlow,
  useStore,
  useNodesInitialized,
  useNodesState,
  ReactFlow,
  ReactFlowProvider,
  BaseEdge,
  Handle,
  addEdge,
} from '@xyflow/react'
import { AvoidLib as AvoidWasm } from 'libavoid-js'
function createExampleScope() {
  const routableEdgeType = 'routable'
  function RoutableEdge({
    sourceX,
    sourceY,
    targetX,
    targetY,
    markerStart,
    markerEnd,
    data,
    style,
  }) {
    return (
      <BaseEdge
        style={style}
        path={useRoutedEdgePath(data?.points ?? [], sourceX, sourceY, targetX, targetY)}
        markerStart={markerStart}
        markerEnd={markerEnd}
      />
    )
  }
  /* 有路由结果时把中间折点连接成 SVG 折线；WASM 尚未就绪时使用无圆角的正交回退路径。 */
  const useRoutedEdgePath = (routePoints, sourceX, sourceY, targetX, targetY) =>
    React.useMemo(() => {
      if (routePoints.length === 0) {
        const [fallbackPath] = getSmoothStepPath({
          sourceX,
          sourceY,
          targetX,
          targetY,
          offset: 0,
          borderRadius: 0,
        })
        return fallbackPath
      }
      const sourcePoint = {
        x: sourceX,
        y: sourceY,
      }
      const targetPoint = {
        x: targetX,
        y: targetY,
      }
      const pathPoints = [sourcePoint, ...routePoints, targetPoint]
      let path = ''
      for (const point of pathPoints) {
        const x = point.x.toFixed(2)
        const y = point.y.toFixed(2)
        path += path ? ` L ${x} ${y}` : `M ${x} ${y}`
      }
      return path
    }, [routePoints, sourceX, sourceY, targetX, targetY])
  const routableNodeType = 'example'
  function RoutableNode({ data }) {
    const handlesBySide = data?.handles ?? {}
    return (
      <React.Fragment>
        <div>{data.label}</div>
        {Object.entries(handlesBySide).map(([side, handles]) => (
          <RoutableNodeHandles key={side} side={side} handles={handles} />
        ))}
      </React.Fragment>
    )
  }
  function RoutableNodeHandles({ side, handles }) {
    return (
      <div className="handles" data-side={side}>
        {handles.map((handle) => (
          <Handle key={handle.id} type={handle.type} position={side} id={handle.id} />
        ))}
      </div>
    )
  }
  /* 根据连接点 ID 在节点各侧的配置中查找方向，供 libavoid 创建有方向约束的连接引脚。 */
  const findHandleSide = (nodeData, handleId) => {
    for (const [side, handles] of Object.entries(nodeData.handles))
      if (handles.some((handle) => handle.id === handleId)) {
        return side
      }
    return null
  }
  const initialRoutingNodes = [
    {
      id: '1',
      type: routableNodeType,
      data: {
        label: 'Node 1',
        handles: {
          [Position.Left]: [
            {
              id: '1',
              type: 'target',
            },
            {
              id: '2',
              type: 'target',
            },
          ],
          [Position.Right]: [
            {
              id: '3',
              type: 'source',
            },
            {
              id: '4',
              type: 'source',
            },
            {
              id: '5',
              type: 'source',
            },
          ],
        },
      },
      position: {
        x: 0,
        y: 0,
      },
    },
    {
      id: '2',
      type: routableNodeType,
      data: {
        label: 'Node 2',
        handles: {
          [Position.Left]: [
            {
              id: '1',
              type: 'target',
            },
            {
              id: '2',
              type: 'target',
            },
          ],
          [Position.Right]: [
            {
              id: '3',
              type: 'source',
            },
            {
              id: '4',
              type: 'source',
            },
          ],
        },
      },
      position: {
        x: 150,
        y: -150,
      },
    },
    {
      id: '3',
      type: routableNodeType,
      data: {
        label: 'Node 3',
        handles: {
          [Position.Left]: [
            {
              id: '1',
              type: 'target',
            },
            {
              id: '2',
              type: 'target',
            },
          ],
          [Position.Right]: [
            {
              id: '3',
              type: 'source',
            },
            {
              id: '4',
              type: 'source',
            },
          ],
        },
      },
      position: {
        x: 150,
        y: -75,
      },
    },
    {
      id: '4',
      type: routableNodeType,
      data: {
        label: 'Node 4',
        handles: {
          [Position.Right]: [
            {
              id: '1',
              type: 'source',
            },
            {
              id: '2',
              type: 'source',
            },
          ],
        },
      },
      position: {
        x: 150,
        y: 0,
      },
    },
    {
      id: '5',
      type: routableNodeType,
      data: {
        label: 'Node 5',
        handles: {
          [Position.Left]: [
            {
              id: '1',
              type: 'target',
            },
            {
              id: '2',
              type: 'target',
            },
            {
              id: '3',
              type: 'target',
            },
          ],
          [Position.Right]: [
            {
              id: '4',
              type: 'source',
            },
            {
              id: '5',
              type: 'source',
            },
          ],
        },
      },
      position: {
        x: 300,
        y: 0,
      },
    },
  ]
  const initialRoutingEdges = [
    {
      id: '1:3->2:1',
      type: routableEdgeType,
      source: '1',
      sourceHandle: '3',
      target: '2',
      targetHandle: '1',
    },
    {
      id: '1:4->3:1',
      type: routableEdgeType,
      source: '1',
      sourceHandle: '4',
      target: '3',
      targetHandle: '1',
    },
    {
      id: '1:5->5:3',
      type: routableEdgeType,
      source: '1',
      sourceHandle: '5',
      target: '5',
      targetHandle: '3',
    },
    {
      id: '2:3->5:1',
      type: routableEdgeType,
      source: '2',
      sourceHandle: '3',
      target: '5',
      targetHandle: '1',
    },
    {
      id: '3:3->5:2',
      type: routableEdgeType,
      source: '3',
      sourceHandle: '3',
      target: '5',
      targetHandle: '2',
    },
    {
      id: '4:1->3:2',
      type: routableEdgeType,
      source: '4',
      sourceHandle: '1',
      target: '3',
      targetHandle: '2',
    },
    {
      id: '5:4->1:2',
      type: routableEdgeType,
      source: '5',
      sourceHandle: '4',
      target: '1',
      targetHandle: '2',
    },
  ]
  function useRoutingGraph() {
    const [nodes, setNodes, onNodesChange] = useNodesState(initialRoutingNodes)
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialRoutingEdges)
    return {
      nodes,
      setNodes,
      onNodesChange,
      edges,
      setEdges,
      onEdgesChange,
    }
  }
  const libavoidWasmUrl = new URL(
    '../../node_modules/libavoid-js/dist/libavoid.wasm?no-inline',
    import.meta.url,
  ).href
  /* 等待节点尺寸就绪后加载 libavoid。同步矩形障碍物和连接引脚，再执行正交路由事务，将结果中的中间折点写回边数据。 */
  function useAvoidRouting() {
    const [router, setRouter] = React.useState(null)
    const nodeShapeIdsRef = React.useRef(new Map())
    const nextShapeIdRef = React.useRef(1)
    const shapeRefs = React.useRef(new Map())
    const connectorRefs = React.useRef(new Map())
    const { setEdges } = useReactFlow()
    const nodesInitialized = useNodesInitialized()
    const graph = useStore(
      (storeState) => ({
        nodes: storeState.nodes,
        edges: storeState.edges,
      }),
      equalRoutingGraph,
    )
    const nodeLookup = useStore((storeState) => storeState.nodeLookup)
    const loadingRef = React.useRef(false)
    React.useEffect(() => {
      if (!nodesInitialized || loadingRef.current) {
        return
      }
      if (!router) {
        loadingRef.current = true
        AvoidWasm.load(libavoidWasmUrl)
          .then(() => {
            const Avoid = AvoidWasm.getInstance()
            const createdRouter = new Avoid.Router(Avoid.PolyLineRouting)
            createdRouter.setRoutingParameter(Avoid.shapeBufferDistance, 10)
            createdRouter.setRoutingParameter(Avoid.idealNudgingDistance, 10)
            createdRouter.setRoutingOption(Avoid.nudgeSharedPathsWithCommonEndPoint, false)
            createdRouter.setRoutingOption(Avoid.performUnifyingNudgingPreprocessingStep, true)
            setRouter(createdRouter)
          })
          .finally(() => {
            loadingRef.current = false
          })
        return
      }
      const Avoid = AvoidWasm.getInstance()
      const activeShapeIds = new Set(
        graph.nodes.flatMap((node) => nodeShapeIdsRef.current.get(node.id) ?? []),
      )
      console.log('activeShapeIds', activeShapeIds)
      for (const [shapeId, shapeRef] of shapeRefs.current) {
        if (!activeShapeIds.has(shapeId)) {
          router.deleteShape(shapeRef)
          shapeRefs.current.delete(shapeId)
        }
      }
      for (const node of graph.nodes) {
        const width = node.measured?.width ?? 0
        const height = node.measured?.height ?? 0
        const topLeft = new Avoid.Point(node.position.x, node.position.y)
        const bottomRight = new Avoid.Point(node.position.x + width, node.position.y + height)
        if (!nodeShapeIdsRef.current.has(node.id)) {
          nodeShapeIdsRef.current.set(node.id, nextShapeIdRef.current++)
        }
        const shapeId = nodeShapeIdsRef.current.get(node.id)
        const rectangle = new Avoid.Rectangle(topLeft, bottomRight)
        if (shapeRefs.current.has(shapeId)) {
          router.moveShape(shapeRefs.current.get(shapeId), rectangle)
        } else {
          const shapeRef = new Avoid.ShapeRef(router, rectangle)
          const nodeData = node.data
          const handleBounds = nodeLookup.get(node.id)?.internals.handleBounds
          const sourceHandles = handleBounds?.source ?? []
          const targetHandles = handleBounds?.target ?? []
          console.log('sourceHandles targetHandles', sourceHandles, targetHandles, node.id)
          for (const handle of [...sourceHandles, ...targetHandles]) {
            const pinId = Number(handle.id)
            const side = findHandleSide(nodeData, handle.id)
            new Avoid.ShapeConnectionPin(
              shapeRef,
              pinId,
              handle.x + handle.width / 2,
              handle.y + handle.height / 2,
              false,
              0,
              side === 'top'
                ? Avoid.ConnDirUp
                : side === 'bottom'
                  ? Avoid.ConnDirDown
                  : side === 'left'
                    ? Avoid.ConnDirLeft
                    : Avoid.ConnDirRight,
            ).setExclusive(false)
          }
          shapeRefs.current.set(shapeId, shapeRef)
        }
        Avoid.destroy(rectangle)
        Avoid.destroy(bottomRight)
        Avoid.destroy(topLeft)
      }
      const activeEdgeIds = new Set(graph.edges.map((edge) => edge.id))
      for (const [edgeId, connectorRef] of connectorRefs.current) {
        if (!activeEdgeIds.has(edgeId)) {
          router.deleteConnector(connectorRef)
          connectorRefs.current.delete(edgeId)
        }
      }
      for (const edge of graph.edges) {
        const sourceShapeId = nodeShapeIdsRef.current.get(edge.source)
        const targetShapeId = nodeShapeIdsRef.current.get(edge.target)
        if (!sourceShapeId || !targetShapeId) {
          continue
        }
        const sourceShape = shapeRefs.current.get(sourceShapeId)
        const targetShape = shapeRefs.current.get(targetShapeId)
        if (!sourceShape || !targetShape) {
          continue
        }
        const sourceEndpoint = new Avoid.ConnEnd(sourceShape, Number(edge.sourceHandle))
        const targetEndpoint = new Avoid.ConnEnd(targetShape, Number(edge.targetHandle))
        if (connectorRefs.current.has(edge.id)) {
          const existingConnector = connectorRefs.current.get(edge.id)
          existingConnector.setSourceEndpoint(sourceEndpoint)
          existingConnector.setDestEndpoint(targetEndpoint)
        } else {
          const connectorRef = new Avoid.ConnRef(router, sourceEndpoint, targetEndpoint)
          connectorRefs.current.set(edge.id, connectorRef)
        }
        Avoid.destroy(sourceEndpoint)
        Avoid.destroy(targetEndpoint)
      }
      router.processTransaction()
      setEdges((edges) =>
        edges.map((edge) => {
          const connectorRef = connectorRefs.current.get(edge.id)
          if (!connectorRef) {
            return edge
          }
          const route = connectorRef.displayRoute()
          const pointCount = route.size()
          const routePoints = []
          for (let pointIndex = 1; pointIndex < pointCount - 1; pointIndex++) {
            const routePoint = route.get_ps(pointIndex)
            routePoints.push({
              x: routePoint.x,
              y: routePoint.y,
            })
          }
          return {
            ...edge,
            data: {
              points: routePoints,
            },
          }
        }),
      )
    }, [router, nodesInitialized, graph, nodeLookup, setEdges])
  }
  /* 仅比较路由依赖的节点几何和边端点，忽略上次路由写入的 data.points，避免结果更新触发无限路由。 */
  function equalRoutingGraph(previousGraph, nextGraph) {
    return (
      equalNodeGeometry(previousGraph.nodes, nextGraph.nodes) &&
      equalEdgeConnections(previousGraph.edges, nextGraph.edges)
    )
  }
  /* 按数组顺序比较节点尺寸和位置；选中状态等与几何无关的变化不会重新计算路径。 */
  function equalNodeGeometry(previousNodes, nextNodes) {
    if (previousNodes.length !== nextNodes.length) {
      return false
    }
    for (let nodeIndex = 0; nodeIndex < previousNodes.length; nodeIndex++) {
      const previousNode = previousNodes[nodeIndex]
      const nextNode = nextNodes[nodeIndex]
      if (
        !nextNode ||
        previousNode.measured?.width !== nextNode.measured?.width ||
        previousNode.measured?.height !== nextNode.measured?.height ||
        previousNode.position.x !== nextNode.position.x ||
        previousNode.position.y !== nextNode.position.y
      ) {
        return false
      }
    }
    return true
  }
  function equalEdgeConnections(previousEdges, nextEdges) {
    if (previousEdges.length !== nextEdges.length) {
      return false
    }
    for (let edgeIndex = 0; edgeIndex < previousEdges.length; edgeIndex++) {
      const previousEdge = previousEdges[edgeIndex]
      const nextEdge = nextEdges[edgeIndex]
      if (
        previousEdge.source !== nextEdge.source ||
        previousEdge.target !== nextEdge.target ||
        previousEdge?.sourceHandle !== nextEdge?.sourceHandle ||
        previousEdge?.targetHandle !== nextEdge?.targetHandle
      ) {
        return false
      }
    }
    return true
  }
  const routingProOptions = {
    hideAttribution: true,
  }
  const routingNodeTypes = {
    [routableNodeType]: RoutableNode,
  }
  const routingEdgeTypes = {
    [routableEdgeType]: RoutableEdge,
  }
  const routingDefaultEdgeOptions = {
    type: routableEdgeType,
    animated: true,
  }
  function EdgeRoutingExample() {
    const { nodes, onNodesChange, edges, setEdges, onEdgesChange } = useRoutingGraph()
    const onConnect = React.useCallback(
      (connection) => setEdges((edges) => addEdge(connection, edges)),
      [setEdges],
    )
    useAvoidRouting()
    return (
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={routingNodeTypes}
        edgeTypes={routingEdgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        defaultEdgeOptions={routingDefaultEdgeOptions}
        proOptions={routingProOptions}
        zoomOnDoubleClick={false}
        fitView
      />
    )
  }
  const _ExampleContent = () => (
    <ReactFlowProvider>
      <EdgeRoutingExample />
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
function EdgeRoutingCanvas() {
  const [Example] = React.useState(createExampleScope)
  return <Example />
}
export { EdgeRoutingCanvas as default }
