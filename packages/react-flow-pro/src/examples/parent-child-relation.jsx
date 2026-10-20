import * as React from 'react'
import {
  Position,
  useEdgesState,
  useReactFlow,
  useStore,
  useNodesState,
  ReactFlow,
  ReactFlowProvider,
  NodeToolbar,
  BackgroundVariant,
  Background,
  Handle,
  addEdge,
} from '@xyflow/react'
function createExampleScope() {
  /* 解除父子关系时，将父节点的绝对坐标加回子节点的相对坐标，使节点在画布上的位置保持不变。 */
  function useDetachNodes() {
    const { setNodes, getNodes, getInternalNode } = useReactFlow()
    return React.useCallback(
      (nodeIdsToDetach, groupIdToRemove) => {
        setNodes(
          getNodes()
            .map((node) => {
              if (nodeIdsToDetach.includes(node.id) && node.parentId) {
                const parentInternalNode = getInternalNode(node.parentId)
                return {
                  ...node,
                  position: {
                    x: node.position.x + (parentInternalNode?.internals.positionAbsolute.x ?? 0),
                    y: node.position.y + (parentInternalNode?.internals.positionAbsolute.y ?? 0),
                  },
                  expandParent: undefined,
                  parentId: undefined,
                  extent: undefined,
                }
              }
              return node
            })
            .filter((node) => !groupIdToRemove || node.id !== groupIdToRemove),
        )
      },
      [setNodes, getNodes, getInternalNode],
    )
  }
  function ChildNode({ id: nodeId, data }) {
    const hasParent = useStore((flowState) => !!flowState.nodeLookup.get(nodeId)?.parentId)
    const { deleteElements } = useReactFlow()
    const detachNodes = useDetachNodes()
    return (
      <React.Fragment>
        <NodeToolbar className="nodrag">
          <button
            onClick={() =>
              deleteElements({
                nodes: [
                  {
                    id: nodeId,
                  },
                ],
              })
            }
          >
            {'Delete'}
          </button>
          {hasParent && <button onClick={() => detachNodes([nodeId])}>{'Detach'}</button>}
        </NodeToolbar>
        <Handle type="target" position={Position.Left} />
        <div className="icon">{'△'}</div>
        <div className="label">{data?.label}</div>
        <Handle type="source" position={Position.Right} />
      </React.Fragment>
    )
  }
  const MemoizedChildNode = React.memo(ChildNode)
  const INITIAL_NODES = [
    {
      id: 'group-1',
      type: 'group',
      position: {
        x: 0,
        y: 0,
      },
      style: {
        width: 300,
        height: 300,
      },
      data: {},
    },
    {
      id: '1',
      type: 'node',
      parentId: 'group-1',
      position: {
        x: 125,
        y: 100,
      },
      data: {
        label: 'Node 1',
      },
      extent: 'parent',
    },
    {
      id: '2',
      type: 'node',
      position: {
        x: 500,
        y: 100,
      },
      data: {
        label: 'Node 2',
      },
    },
  ]
  const INITIAL_EDGES = []
  const sortGroupsFirst = (firstNode, secondNode) =>
    firstNode.type === secondNode.type
      ? 0
      : firstNode.type === 'group' && secondNode.type !== 'group'
        ? -1
        : 1
  /* 将位置换算到父节点坐标系并限制在父节点边界内；沿用原实现，对传入节点的 position 对象原地更新。 */
  const getClampedRelativePosition = (node, parentNode) => {
    const relativePosition = node.position ?? {
      x: 0,
      y: 0,
    }
    const nodeWidth = node.measured?.width ?? 0
    const nodeHeight = node.measured?.height ?? 0
    const parentWidth = parentNode.measured?.width ?? 0
    const parentHeight = parentNode.measured?.height ?? 0
    if (relativePosition.x < parentNode.position.x) {
      relativePosition.x = 0
    } else {
      if (relativePosition.x + nodeWidth > parentNode.position.x + parentWidth) {
        relativePosition.x = parentWidth - nodeWidth
      } else {
        relativePosition.x -= parentNode.position.x
      }
    }
    if (relativePosition.y < parentNode.position.y) {
      relativePosition.y = 0
    } else {
      if (relativePosition.y + nodeHeight > parentNode.position.y + parentHeight) {
        relativePosition.y = parentHeight - nodeHeight
      } else {
        relativePosition.y -= parentNode.position.y
      }
    }
    return relativePosition
  }
  /* 拖动过程中通过相交检测提示分组，结束时把节点附着到首个相交分组，并设置 parent 范围约束。 */
  function useParentChildDrag() {
    const { getIntersectingNodes, getNodes, setNodes } = useReactFlow()
    return {
      onNodeDragStop: React.useCallback(
        /* 建立父子关系后将父分组排序到子节点之前，满足 React Flow 的父节点解析顺序。 */ (
          dragEvent,
          draggedNode,
        ) => {
          if (draggedNode.type !== 'node' && !draggedNode.parentId) {
            return
          }
          const intersectingGroups = getIntersectingNodes(draggedNode).filter(
            (candidateNode) => candidateNode.type === 'group',
          )
          const targetGroup = intersectingGroups[0]
          if (intersectingGroups.length && draggedNode.parentId !== targetGroup?.id) {
            setNodes(
              getNodes()
                .map((node) => {
                  if (node.id === targetGroup.id) {
                    return {
                      ...node,
                      className: '',
                    }
                  }
                  if (node.id === draggedNode.id) {
                    const relativePosition = getClampedRelativePosition(node, targetGroup) ?? {
                      x: 0,
                      y: 0,
                    }
                    return {
                      ...node,
                      position: relativePosition,
                      parentId: targetGroup.id,
                      extent: 'parent',
                    }
                  }
                  return node
                })
                .sort(sortGroupsFirst),
            )
          }
        },
        [getIntersectingNodes, getNodes, setNodes],
      ),
      onNodeDrag: React.useCallback(
        (dragEvent, draggedNode) => {
          if (draggedNode.type !== 'node' && !draggedNode.parentId) {
            return
          }
          const intersectingGroups = getIntersectingNodes(draggedNode).filter(
            (candidateNode) => candidateNode.type === 'group',
          )
          const groupHighlightClass =
            intersectingGroups.length && draggedNode.parentId !== intersectingGroups[0]?.id
              ? 'active'
              : ''
          console.log(groupHighlightClass)
          setNodes((currentNodes) =>
            currentNodes.map((node) =>
              node.type === 'group'
                ? {
                    ...node,
                    className: groupHighlightClass,
                  }
                : node.id === draggedNode.id
                  ? {
                      ...node,
                      position: draggedNode.position,
                    }
                  : {
                      ...node,
                    },
            ),
          )
        },
        [getIntersectingNodes, setNodes],
      ),
    }
  }
  const PRO_OPTIONS = {
    hideAttribution: true,
  }
  const NODE_TYPES = {
    node: MemoizedChildNode,
  }
  function ParentChildRelationFlow() {
    const [nodes, , onNodesChange] = useNodesState(INITIAL_NODES)
    const [edges, setEdges, onEdgesChange] = useEdgesState(INITIAL_EDGES)
    const onConnect = React.useCallback(
      (connection) => setEdges((currentEdges) => addEdge(connection, currentEdges)),
      [setEdges],
    )
    const { onNodeDrag, onNodeDragStop } = useParentChildDrag()
    return (
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onEdgesChange={onEdgesChange}
        onNodesChange={onNodesChange}
        onConnect={onConnect}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        proOptions={PRO_OPTIONS}
        fitView
        selectNodesOnDrag={false}
        nodeTypes={NODE_TYPES}
        colorMode="system"
      >
        <Background color="#bbb" gap={50} variant={BackgroundVariant.Dots} />
      </ReactFlow>
    )
  }
  const initialElement = (
    <React.StrictMode>
      <ReactFlowProvider>
        <ParentChildRelationFlow />
      </ReactFlowProvider>
    </React.StrictMode>
  )
  return function ExampleRoot() {
    return initialElement
  }
}
function ParentChildRelationCanvas() {
  const [Example] = React.useState(createExampleScope)
  return <Example />
}
export { ParentChildRelationCanvas as default }
