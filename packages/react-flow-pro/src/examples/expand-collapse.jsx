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
function createExampleScope() {
  const INITIAL_NODES = [
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
  const INITIAL_EDGES = [
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
  function expandCollapseLabel({ expanded, expandable }) {
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
  }) {
    const { addNodes, addEdges, fitView } = useReactFlow()
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
  /* 根据后继节点设置 expandable；遇到折叠节点时用栈遍历后代，并从本次布局图中逐一移除，原始节点数组仍保留。 */
  function removeCollapsedDescendants(graph, node) {
    const descendantIds = graph.successors(node.id)
    node.data.expandable = !!descendantIds?.length
    if (!node.data.expanded) {
      for (; descendantIds?.length;) {
        const descendantId = descendantIds.pop()
        descendantIds.push(...graph.successors(descendantId))
        graph.removeNode(descendantId)
      }
    }
  }
  /* 为完整节点集构建 Dagre 图，移除折叠分支后仅对可见节点布局；展开状态保存在原数据中，重新展开即可恢复后代。 */
  function useExpandCollapse(
    nodes,
    edges,
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
  /* 点击节点只切换其 expanded 状态，派生的可见节点交给画布渲染，再以动画调整视口。 */
  function ExpandCollapseFlow({ treeWidth = 220, treeHeight = 100 } = {}) {
    const [nodes, setNodes] = React.useState(INITIAL_NODES)
    const [edges, setEdges] = React.useState(INITIAL_EDGES)
    const { fitView } = useReactFlow()
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
          (nodeChanges) => setNodes((currentNodes) => applyNodeChanges(nodeChanges, currentNodes)),
          [],
        )}
        onEdgesChange={React.useCallback(
          (edgeChanges) => setEdges((currentEdges) => applyEdgeChanges(edgeChanges, currentEdges)),
          [],
        )}
        onNodeClick={React.useCallback(
          (clickEvent, clickedNode) => {
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
  const [Example] = React.useState(createExampleScope)
  return <Example />
}
export { ExpandCollapseCanvas as default }
