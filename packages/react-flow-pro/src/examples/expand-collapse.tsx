/**
 * 展开与折叠：保留完整图状态，根据节点展开标记派生可见树并重新计算布局。
 * 每个画布实例通过 createExampleScope 创建独立作用域，避免缓存、store 和可变初始数据跨实例共享。
 */
import * as React from 'react'
import { LayoutControlsProvider, LayoutControlsPanel } from '../controls/layout-controls'
import { useLayoutControls } from '../controls/layout-controls-context'
import {
  Position,
  useReactFlow,
  ReactFlow,
  applyNodeChanges,
  Controls,
  ReactFlowProvider,
  MiniMap,
  Background,
  Handle,
  applyEdgeChanges,
} from '@xyflow/react'
import dagre from '@dagrejs/dagre'
import type { Edge, Node, NodeProps, NodeChange, EdgeChange } from '@xyflow/react'

/** expanded 是用户状态，expandable 在布局前按后继节点数量派生。 */
type ExpandableNode = Node<{ expanded?: boolean; expandable?: boolean; label?: string }>

/** 创建本示例的组件、算法和局部状态；根组件惰性初始化后在本次挂载中复用。 */
function createExampleScope() {
  const INITIAL_NODES: ExpandableNode[] = [
    {
      id: 'A',
      position: {
        x: 0,
        y: 0,
      },
      data: {
        expanded: true,
      },
      type: 'expandcollapse',
    },
    {
      id: 'B',
      position: {
        x: 0,
        y: 0,
      },
      data: {
        expanded: false,
      },
      type: 'expandcollapse',
    },
    {
      id: 'C',
      position: {
        x: 0,
        y: 0,
      },
      data: {
        expanded: false,
      },
      type: 'expandcollapse',
    },
    {
      id: 'D',
      position: {
        x: 0,
        y: 0,
      },
      data: {
        expanded: true,
      },
      type: 'expandcollapse',
    },
    {
      id: 'E',
      position: {
        x: 0,
        y: 0,
      },
      data: {
        expanded: true,
      },
      type: 'expandcollapse',
    },
    {
      id: 'F',
      position: {
        x: 0,
        y: 0,
      },
      data: {
        expanded: true,
      },
      type: 'expandcollapse',
    },
    {
      id: 'G',
      position: {
        x: 0,
        y: 0,
      },
      data: {
        expanded: true,
      },
      type: 'expandcollapse',
    },
    {
      id: 'H',
      position: {
        x: 0,
        y: 0,
      },
      data: {
        expanded: true,
      },
      type: 'expandcollapse',
    },
  ]
  const INITIAL_EDGES: Edge[] = [
    {
      id: 'A->B',
      source: 'A',
      target: 'B',
    },
    {
      id: 'A->C',
      source: 'A',
      target: 'C',
    },
    {
      id: 'B->E',
      source: 'B',
      target: 'E',
    },
    {
      id: 'C->F',
      source: 'C',
      target: 'F',
    },
    {
      id: 'D->G',
      source: 'D',
      target: 'G',
    },
    {
      id: 'D->H',
      source: 'D',
      target: 'H',
    },
  ]
  /* 根据是否有子节点、是否展开选择节点提示文字。 */
  function expandCollapseLabel({ expanded, expandable }: ExpandableNode['data']) {
    if (expandable) {
      if (expanded) {
        return 'collapse ▲'
      } else {
        return 'expand ▼'
      }
    } else {
      return 'no child nodes'
    }
  }
  /* 节点提供上下连接点和新增子节点按钮；已展开时阻止按钮点击冒泡，避免同时折叠父节点。 */
  function ExpandCollapseNode({
    data: nodeData,
    id: nodeId,
    positionAbsoluteX,
    positionAbsoluteY,
  }: NodeProps<ExpandableNode>) {
    const { addNodes, addEdges, fitView } = useReactFlow<ExpandableNode, Edge>()
    return (
      <div>
        <div>{expandCollapseLabel(nodeData)}</div>
        <Handle position={Position.Top} type="target" />
        <Handle position={Position.Bottom} type="source" />
        <button
          onClick={(clickEvent) => {
            if (nodeData.expanded) {
              clickEvent.preventDefault()
              clickEvent.stopPropagation()
            }
            const childNodeId = `${nodeId}__${new Date().getTime()}`
            addNodes({
              id: childNodeId,
              position: {
                x: positionAbsoluteX,
                y: positionAbsoluteY + 100,
              },
              data: {
                label: 'X',
              },
              type: 'expandcollapse',
            })
            addEdges({
              id: `${nodeId}->${childNodeId}`,
              source: nodeId,
              target: childNodeId,
            })
            fitView({
              duration: 300,
            })
          }}
        >
          {'+ add child node'}
        </button>
      </div>
    )
  }
  /**
   * 根据 Dagre 图的后继列表派生 expandable，供节点提示是否还有可展开子节点。
   * 当 expanded 为假时，用栈遍历后代，并从本轮临时布局图删除；原始 nodes/edges 不删除。
   * 后续节点可能已随祖先折叠移除，successors 返回空值时按空后继处理。
   * expanded 属于用户状态，expandable 属于派生状态；再次展开仍能恢复完整后代。
   */
  function removeCollapsedDescendants(
    graph: InstanceType<typeof dagre.graphlib.Graph>,
    node: ExpandableNode,
  ) {
    const descendantIds = graph.successors(node.id)
    node.data.expandable = !!descendantIds?.length
    if (!node.data.expanded) {
      for (; descendantIds?.length;) {
        const descendantId = descendantIds.pop()!
        descendantIds.push(...(graph.successors(descendantId) ?? []))
        graph.removeNode(descendantId)
      }
    }
  }
  /**
   * 从完整图状态派生本轮可见节点，再用 Dagre 按从上到下的方向布局。
   * treeWidth/treeHeight 是布局用的虚拟节点尺寸，用于控制分支间距与层间距。
   * 折叠仅影响临时布局图：输出保留原始边集，可见节点只改 position 和派生 data。
   * 关闭 layoutNodes 时直接返回输入，便于保留已有位置；useMemo 缓存相同输入的结果。
   */
  function useExpandCollapse(
    nodes: ExpandableNode[],
    edges: Edge[],
    { layoutNodes = true, treeWidth = 220, treeHeight = 100 } = {},
  ) {
    return React.useMemo(() => {
      if (!layoutNodes) {
        return {
          nodes,
          edges,
        }
      }
      const layoutGraph = new dagre.graphlib.Graph()
        .setDefaultEdgeLabel(() => ({}))
        .setGraph({
          rankdir: 'TB',
        })
      for (const inputNode of nodes)
        layoutGraph.setNode(inputNode.id, {
          width: treeWidth,
          height: treeHeight,
          data: inputNode.data,
        })
      for (const inputEdge of edges) layoutGraph.setEdge(inputEdge.source, inputEdge.target)
      for (const inputNode of nodes) removeCollapsedDescendants(layoutGraph, inputNode)
      dagre.layout(layoutGraph)
      return {
        nodes: nodes.flatMap((inputNode) => {
          if (!layoutGraph.hasNode(inputNode.id)) {
            return []
          }
          const { x: layoutX, y: layoutY } = layoutGraph.node(inputNode.id)
          const layoutPosition = {
            x: layoutX,
            y: layoutY,
          }
          const nodeData = {
            ...inputNode.data,
          }
          return [
            {
              ...inputNode,
              position: layoutPosition,
              data: nodeData,
            },
          ]
        }),
        edges,
      }
    }, [nodes, edges, layoutNodes, treeWidth, treeHeight])
  }
  const PRO_OPTIONS = {
    account: 'paid-pro',
    hideAttribution: true,
  }
  const EXPAND_COLLAPSE_NODE_TYPES = {
    expandcollapse: ExpandCollapseNode,
  }
  /**
   * 点击节点时仅反转 data.expanded；可见节点列表由 useExpandCollapse 派生。
   * 节点按钮追加子节点和对应边，已展开时阻止冒泡，避免新增操作同时触发折叠。
   * 画布禁止拖动与连接，位置由布局统一生成；视口在切换展开状态后以动画调整。
   */
  function ExpandCollapseFlow({ treeWidth = 220, treeHeight = 100 } = {}) {
    const [nodes, setNodes] = React.useState(INITIAL_NODES)
    const [edges, setEdges] = React.useState(INITIAL_EDGES)
    const { fitView } = useReactFlow<ExpandableNode, Edge>()
    const { nodes: visibleNodes, edges: layoutEdges } = useExpandCollapse(nodes, edges, {
      treeWidth,
      treeHeight,
    })
    return (
      <ReactFlow
        fitView
        nodes={visibleNodes}
        edges={layoutEdges}
        onNodesChange={React.useCallback(
          (nodeChanges: NodeChange<ExpandableNode>[]) =>
            setNodes((currentNodes) => applyNodeChanges(nodeChanges, currentNodes)),
          [],
        )}
        onEdgesChange={React.useCallback(
          (edgeChanges: EdgeChange<Edge>[]) =>
            setEdges((currentEdges) => applyEdgeChanges(edgeChanges, currentEdges)),
          [],
        )}
        onNodeClick={React.useCallback(
          (_clickEvent: React.MouseEvent, clickedNode: ExpandableNode) => {
            setNodes((currentNodes) =>
              currentNodes.map((currentNode) =>
                currentNode.id === clickedNode.id
                  ? {
                      ...currentNode,
                      data: {
                        ...currentNode.data,
                        expanded: !currentNode.data.expanded,
                      },
                    }
                  : currentNode,
              ),
            )
            fitView({
              duration: 300,
            })
          },
          [fitView],
        )}
        proOptions={PRO_OPTIONS}
        nodeTypes={EXPAND_COLLAPSE_NODE_TYPES}
        nodesDraggable={false}
        nodesConnectable={false}
        zoomOnDoubleClick={false}
        elementsSelectable={false}
        colorMode="system"
      >
        <LayoutControlsPanel />
        <Background />
        <Controls />
        <MiniMap />
      </ReactFlow>
    )
  }
  function ExpandCollapseExample() {
    return (
      <ReactFlowProvider>
        <ExpandCollapseFlow
          {...useLayoutControls({
            treeWidth: {
              value: 220,
              min: 0,
              max: 440,
            },
            treeHeight: {
              value: 100,
              min: 0,
              max: 200,
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
          <ExpandCollapseExample />
        </React.StrictMode>
      }
    </LayoutControlsProvider>
  )
  return function ExampleRoot() {
    return initialElement
  }
}
function ExpandCollapseCanvas() {
  // 惰性保存组件类型，使普通重渲染沿用同一份图状态；工作台重置时重新挂载。
  const [Example] = React.useState(createExampleScope)
  return <Example />
}
export { ExpandCollapseCanvas as default }
