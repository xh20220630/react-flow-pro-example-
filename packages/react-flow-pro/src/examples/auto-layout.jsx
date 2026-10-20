import * as React from 'react'
import { LayoutControlsProvider, LayoutControlsPanel } from '../controls/layout-controls'
import { useLayoutControls } from '../controls/layout-controls-context'
import {
  getIncomers,
  Position,
  MarkerType,
  ConnectionLineType,
  useEdgesState,
  useReactFlow,
  useStore,
  useNodesInitialized,
  useNodesState,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
} from '@xyflow/react'
import { button as levaButton } from 'leva'
import dagre from '@dagrejs/dagre'
import { stratify, tree } from 'd3-hierarchy'
import ELK from 'elkjs/lib/elk.bundled.js'
function createExampleScope() {
  /* 把布局方向转换成节点出边连接点方位。 */
  function sourcePositionForDirection(direction) {
    switch (direction) {
      case 'TB':
        return Position.Bottom
      case 'BT':
        return Position.Top
      case 'LR':
        return Position.Right
      case 'RL':
        return Position.Left
    }
  }
  /* 把布局方向转换成节点入边连接点方位。 */
  function targetPositionForDirection(direction) {
    switch (direction) {
      case 'TB':
        return Position.Top
      case 'BT':
        return Position.Bottom
      case 'LR':
        return Position.Left
      case 'RL':
        return Position.Right
    }
  }
  function createAutoLayoutId() {
    return `${Date.now()}`
  }
  const dagreGraph = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}))
  /* 按当前节点清理 Dagre 图并设置测量尺寸、层间距与节点间距；布局结果的中心坐标减去半宽高后变为左上角坐标。 */
  const layoutWithDagre = async (nodes, edges, options) => {
    dagreGraph.setGraph({
      rankdir: options.direction,
      nodesep: options.spacing[0],
      ranksep: options.spacing[1],
    })
    const currentNodeIds = nodes.map((currentNode) => currentNode.id)
    dagreGraph.nodes().forEach((graphNodeId) => {
      if (!currentNodeIds.includes(graphNodeId)) {
        dagreGraph.removeNode(graphNodeId)
      }
    })
    for (const measuredNode of nodes)
      dagreGraph.setNode(measuredNode.id, {
        width: measuredNode.measured?.width ?? 0,
        height: measuredNode.measured?.height ?? 0,
      })
    for (const inputEdge of edges) dagreGraph.setEdge(inputEdge.source, inputEdge.target)
    dagre.layout(dagreGraph)
    return {
      nodes: nodes.map((inputNode) => {
        const { x: centerX, y: centerY } = dagreGraph.node(inputNode.id)
        const topLeftPosition = {
          x: centerX - (inputNode.measured?.width ?? 0) / 2,
          y: centerY - (inputNode.measured?.height ?? 0) / 2,
        }
        return {
          ...inputNode,
          position: topLeftPosition,
        }
      }),
      edges,
    }
  }
  /* 将自上而下的树坐标按目标方向交换坐标轴或反向。 */
  const orientTreePosition = (treeX, treeY, direction) => {
    switch (direction) {
      case 'TB':
        return {
          x: treeX,
          y: treeY,
        }
      case 'LR':
        return {
          x: treeY,
          y: treeX,
        }
      case 'BT':
        return {
          x: -treeX,
          y: -treeY,
        }
      case 'RL':
        return {
          x: -treeY,
          y: treeX,
        }
    }
  }
  const hierarchyTreeLayout = tree().separation(() => 1)
  const HIERARCHY_ROOT = {
    id: 'd3-hierarchy-root',
    x: 0,
    y: 0,
    position: {
      x: 0,
      y: 0,
    },
    data: {},
  }
  /* 以虚拟根连接多个根节点，按最大节点尺寸和间距配置树布局，再把 d3 坐标转换成所需方向的节点左上角。 */
  const layoutWithHierarchy = async (nodes, edges, options) => {
    const isHorizontal = options.direction === 'RL' || options.direction === 'LR'
    const hierarchyInputs = []
    let maximumNodeWidth = 0
    let maximumNodeHeight = 0
    for (const inputNode of nodes) {
      const hierarchyInput = {
        ...inputNode,
        ...inputNode.position,
      }
      hierarchyInputs.push(hierarchyInput)
      maximumNodeWidth = Math.max(maximumNodeWidth, inputNode.measured?.width ?? 0)
      maximumNodeHeight = Math.max(maximumNodeHeight, inputNode.measured?.height ?? 0)
    }
    const nodeSpacing = isHorizontal
      ? [maximumNodeHeight + options.spacing[1], maximumNodeWidth + options.spacing[0]]
      : [maximumNodeWidth + options.spacing[0], maximumNodeHeight + options.spacing[1]]
    hierarchyTreeLayout.nodeSize(nodeSpacing)
    const laidOutHierarchy = hierarchyTreeLayout(
      stratify()
        .id((hierarchyInput) => hierarchyInput.id)
        .parentId((hierarchyInput) => {
          if (hierarchyInput.id !== HIERARCHY_ROOT.id) {
            return getIncomers(hierarchyInput, nodes, edges)[0]?.id || HIERARCHY_ROOT.id
          }
        })([HIERARCHY_ROOT, ...hierarchyInputs]),
    )
    const hierarchyById = new Map()
    for (const hierarchyNode of laidOutHierarchy) hierarchyById.set(hierarchyNode.id, hierarchyNode)
    return {
      nodes: nodes.map((inputNode) => {
        const { x: treeX, y: treeY } = hierarchyById.get(inputNode.id)
        const orientedPosition = orientTreePosition(treeX, treeY, options.direction)
        const topLeftPosition = {
          x: orientedPosition.x - (inputNode.measured?.width ?? 0) / 2,
          y: orientedPosition.y - (inputNode.measured?.height ?? 0) / 2,
        }
        return {
          ...inputNode,
          position: topLeftPosition,
        }
      }),
      edges,
    }
  }
  const elkLayoutEngine = new ELK()
  /* 将 React Flow 使用的 TB/LR/BT/RL 方向转换成 ELK 的方向名称。 */
  function elkDirection(direction) {
    switch (direction) {
      case 'TB':
        return 'DOWN'
      case 'LR':
        return 'RIGHT'
      case 'BT':
        return 'UP'
      case 'RL':
        return 'LEFT'
    }
  }
  const LAYOUT_ALGORITHMS = {
    dagre: layoutWithDagre,
    'd3-hierarchy': layoutWithHierarchy,
    elk: /* 把 React Flow 节点尺寸和连线端点转换成 ELK 图，异步计算后按节点 id 合并新坐标。 */ async (
      nodes,
      edges,
      options,
    ) => {
      const elkGraph = {
        id: 'elk-root',
        layoutOptions: {
          'elk.algorithm': 'mrtree',
          'elk.direction': elkDirection(options.direction),
          'elk.spacing.nodeNode': `${options.spacing[0]}`,
        },
        children: nodes.map((inputNode) => ({
          id: inputNode.id,
          width: inputNode.measured?.width ?? 0,
          height: inputNode.measured?.height ?? 0,
        })),
        edges: edges.map((inputEdge) => ({
          id: inputEdge.id,
          sources: [inputEdge.source],
          targets: [inputEdge.target],
        })),
      }
      const laidOutGraph = await elkLayoutEngine.layout(elkGraph)
      const elkNodeById = new Map()
      for (const laidOutNode of laidOutGraph.children ?? [])
        elkNodeById.set(laidOutNode.id, laidOutNode)
      return {
        nodes: nodes.map((inputNode) => {
          const laidOutNode = elkNodeById.get(inputNode.id)
          const topLeftPosition = {
            x: laidOutNode.x,
            y: laidOutNode.y,
          }
          return {
            ...inputNode,
            position: topLeftPosition,
          }
        }),
        edges,
      }
    },
  }
  /* 等待节点尺寸初始化，仅当布局参数、节点尺寸或连线拓扑发生变化时运行选定算法；完成后显示节点并同步连接点方向。 */
  function useAutoLayout(options) {
    const { setNodes, setEdges } = useReactFlow()
    const nodesInitialized = useNodesInitialized()
    const layoutInputs = useStore(
      (store) => ({
        nodes: store.nodes,
        edges: store.edges,
      }),
      layoutInputsEqual,
    )
    React.useEffect(() => {
      if (!(!nodesInitialized || layoutInputs.nodes.length === 0)) {
        ;(async () => {
          const layoutAlgorithm = LAYOUT_ALGORITHMS[options.algorithm]
          const inputNodes = layoutInputs.nodes.map((currentNode) => ({
            ...currentNode,
          }))
          const inputEdges = layoutInputs.edges.map((currentEdge) => ({
            ...currentEdge,
          }))
          const { nodes: laidOutNodes, edges: laidOutEdges } = await layoutAlgorithm(
            inputNodes,
            inputEdges,
            options,
          )
          for (const laidOutNode of laidOutNodes) {
            laidOutNode.style = {
              ...laidOutNode.style,
              opacity: 1,
            }
            laidOutNode.sourcePosition = sourcePositionForDirection(options.direction)
            laidOutNode.targetPosition = targetPositionForDirection(options.direction)
          }
          for (const inputEdge of inputEdges)
            inputEdge.style = {
              ...inputEdge.style,
              opacity: 1,
            }
          setNodes(laidOutNodes)
          setEdges(laidOutEdges)
        })()
      }
    }, [nodesInitialized, layoutInputs, options, setNodes, setEdges])
  }
  function layoutInputsEqual(previousInputs, nextInputs) {
    return (
      layoutNodesEqual(previousInputs.nodes, nextInputs.nodes) &&
      layoutEdgesEqual(previousInputs.edges, nextInputs.edges)
    )
  }
  /* 节点比较只关心数量和测量尺寸；正在拖动或缩放时保持相等，避免布局过程反复触发。 */
  function layoutNodesEqual(previousNodes, nextNodes) {
    if (previousNodes.length !== nextNodes.length) {
      return false
    }
    for (let nodeIndex = 0; nodeIndex < previousNodes.length; nodeIndex++) {
      const previousNode = previousNodes[nodeIndex]
      const nextNode = nextNodes[nodeIndex]
      if (!nextNode) {
        return false
      }
      if (previousNode.resizing || previousNode.dragging) {
        return true
      }
      if (
        previousNode.measured?.width !== nextNode.measured?.width ||
        previousNode.measured?.height !== nextNode.measured?.height
      ) {
        return false
      }
    }
    return true
  }
  /* 连线比较检查数量、起终点和 handle，忽略布局无关属性。 */
  function layoutEdgesEqual(previousEdges, nextEdges) {
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
  const INITIAL_NODES = [
    {
      id: '1',
      data: {
        label: 'Node 1',
      },
      position: {
        x: 0,
        y: 0,
      },
    },
    {
      id: '2',
      data: {
        label: 'Node 2',
      },
      position: {
        x: 0,
        y: 0,
      },
    },
    {
      id: '3',
      data: {
        label: 'Node 3',
      },
      position: {
        x: 0,
        y: 0,
      },
    },
    {
      id: '4',
      data: {
        label: 'Node 4',
      },
      position: {
        x: 0,
        y: 0,
      },
    },
    {
      id: '5',
      data: {
        label: 'Node 5',
      },
      position: {
        x: 0,
        y: 0,
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
      id: '4->5',
      source: '4',
      target: '5',
    },
  ]
  const PRO_OPTIONS = {
    hideAttribution: true,
  }
  const DEFAULT_EDGE_OPTIONS = {
    type: 'smoothstep',
    markerEnd: {
      type: MarkerType.ArrowClosed,
    },
    pathOptions: {
      offset: 5,
    },
  }
  /* 控制面板选择布局算法、方向与间距；新增节点先隐藏，待布局完成后显示并自动调整视口。 */
  function AutoLayoutFlow() {
    const { fitView, addNodes } = useReactFlow()
    const [nodes, setNodes, onNodesChange] = useNodesState(INITIAL_NODES)
    const [edges, setEdges, onEdgesChange] = useEdgesState(INITIAL_EDGES)
    useAutoLayout(
      useLayoutControls({
        algorithm: {
          value: 'dagre',
          options: ['dagre', 'd3-hierarchy', 'elk'],
        },
        direction: {
          value: 'TB',
          options: {
            down: 'TB',
            right: 'LR',
            up: 'BT',
            left: 'RL',
          },
        },
        spacing: [50, 50],
        'add root node': levaButton(() =>
          addNodes({
            id: createAutoLayoutId(),
            position: {
              x: 0,
              y: 0,
            },
            data: {
              label: 'New Node',
            },
            style: {
              opacity: 0,
            },
          }),
        ),
      }),
    )
    const addChildNode = React.useCallback(
      (parentNodeId) => {
        const childNodeId = createAutoLayoutId()
        const childNode = {
          id: childNodeId,
          data: {
            label: `Node ${nodes.length + 1}`,
          },
          position: {
            x: 0,
            y: 0,
          },
          style: {
            opacity: 0,
          },
        }
        const parentToChildEdge = {
          id: `${parentNodeId}->${childNodeId}`,
          source: parentNodeId,
          target: childNodeId,
          style: {
            opacity: 0,
          },
        }
        setNodes((currentNodes) => currentNodes.concat([childNode]))
        setEdges((currentEdges) => currentEdges.concat([parentToChildEdge]))
      },
      [setNodes, setEdges, nodes.length],
    )
    const onNodeClick = React.useCallback(
      (clickEvent, clickedNode) => {
        addChildNode(clickedNode.id)
      },
      [addChildNode],
    )
    const onConnect = React.useCallback(
      (connection) => setEdges((currentEdges) => addEdge(connection, currentEdges)),
      [setEdges],
    )
    React.useEffect(() => {
      fitView()
    }, [nodes, fitView])
    return (
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        nodesDraggable={false}
        defaultEdgeOptions={DEFAULT_EDGE_OPTIONS}
        connectionLineType={ConnectionLineType.SmoothStep}
        proOptions={PRO_OPTIONS}
        zoomOnDoubleClick={false}
        colorMode="system"
      >
        <LayoutControlsPanel />
      </ReactFlow>
    )
  }
  const _ExampleContent = () => (
    <ReactFlowProvider>
      <AutoLayoutFlow />
    </ReactFlowProvider>
  )
  const initialElement = (
    <LayoutControlsProvider>
      {
        <React.StrictMode>
          <_ExampleContent />
        </React.StrictMode>
      }
    </LayoutControlsProvider>
  )
  return function ExampleRoot() {
    return initialElement
  }
}
function AutoLayoutCanvas() {
  const [Example] = React.useState(createExampleScope)
  return <Example />
}
export { AutoLayoutCanvas as default }
