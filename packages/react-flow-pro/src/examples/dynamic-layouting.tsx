/**
 * 动态树布局：占位节点、追加分支和边中插入共同维护树结构，再以动画展示新布局。
 * 每个画布实例通过 createExampleScope 创建独立作用域，避免缓存、store 和可变初始数据跨实例共享。
 */
import * as React from 'react'
import { timer as createAnimationTimer } from 'd3-timer'
import {
  getOutgoers,
  Position,
  getBezierPath,
  useReactFlow,
  useStore,
  ReactFlow,
  ReactFlowProvider,
  BaseEdge,
  EdgeLabelRenderer,
  Background,
  Handle,
} from '@xyflow/react'
import { stratify, tree } from 'd3-hierarchy'
import type { Edge, EdgeProps, Node, NodeProps, ReactFlowState } from '@xyflow/react'

/** 工作流节点和末端占位节点使用相同标签数据，由 type 决定交互方式。 */
type WorkflowNode = Node<{ label: string }>

/** 创建本示例的组件、算法和局部状态；根组件惰性初始化后在本次挂载中复用。 */
function createExampleScope() {
  const workflowTreeLayout = tree<WorkflowNode>()
    .nodeSize([200, 150])
    .separation(() => 1)
  const ANIMATION_OPTIONS = {
    duration: 300,
  }
  /**
   * 把工作流图转成 D3 层级树，再将树布局坐标合并回原节点数据。
   * 每个节点通过入边 target 找到父节点 source；输入必须是可由 stratify 表示的单根树。
   * tree 的 nodeSize 固定同层与层间距离，separation 固定相邻分支之间的间距系数。
   * 空图直接返回空数组；布局只替换 position，保留节点类型、标签及其他属性。
   */
  function layoutWorkflowTree(nodes: WorkflowNode[], edges: Edge[]): WorkflowNode[] {
    if (nodes.length === 0) {
      return []
    } else {
      return workflowTreeLayout(
        stratify<WorkflowNode>()
          .id((workflowNode) => workflowNode.id)
          .parentId(
            (workflowNode) =>
              edges.find((incomingEdge) => incomingEdge.target === workflowNode.id)?.source,
          )(nodes),
      )
        .descendants()
        .map((hierarchyNode) => ({
          ...hierarchyNode.data,
          position: {
            x: hierarchyNode.x,
            y: hierarchyNode.y,
          },
        }))
    }
  }
  const selectNodeCount = (store: ReactFlowState) => store.nodeLookup.size
  /**
   * 用节点数量作为布局触发条件：增加、转换占位末端或边中插入后重新排树。
   * 先保存每个节点的当前画布坐标与目标坐标，再由 D3 定时器逐帧线性插值。
   * 结束时写入准确目标，首次布局由 ReactFlow 的 fitView 处理，后续变更再调整视口。
   * effect 清理会停止旧计时器，快速连续操作时不会让旧动画继续覆盖新布局。
   */
  function useWorkflowLayout() {
    const firstLayoutRef = React.useRef(true)
    const nodeCount = useStore(selectNodeCount)
    const { getNodes, getNode, setNodes, setEdges, getEdges, fitView } = useReactFlow<
      WorkflowNode,
      Edge
    >()
    React.useEffect(() => {
      const nodeTransitions = layoutWorkflowTree(getNodes(), getEdges()).map((targetNode) => ({
        id: targetNode.id,
        from: getNode(targetNode.id)?.position || targetNode.position,
        to: targetNode.position,
        node: targetNode,
      }))
      const animationTimer = createAnimationTimer((elapsedMilliseconds) => {
        const progress = elapsedMilliseconds / ANIMATION_OPTIONS.duration
        setNodes(
          nodeTransitions.map(({ node: transitionNode, from: fromPosition, to: toPosition }) => ({
            ...transitionNode,
            position: {
              x: fromPosition.x + (toPosition.x - fromPosition.x) * progress,
              y: fromPosition.y + (toPosition.y - fromPosition.y) * progress,
            },
          })),
        )
        if (elapsedMilliseconds > ANIMATION_OPTIONS.duration) {
          setNodes(
            nodeTransitions.map(({ node: transitionNode, to: toPosition }) => ({
              ...transitionNode,
              position: {
                x: toPosition.x,
                y: toPosition.y,
              },
            })),
          )
          animationTimer.stop()
          if (!firstLayoutRef.current) {
            fitView({
              duration: 200,
              padding: 0.2,
            })
          }
          firstLayoutRef.current = false
        }
      })
      return () => {
        animationTimer.stop()
      }
    }, [nodeCount, getEdges, getNodes, getNode, setNodes, fitView, setEdges])
  }
  const createWorkflowId = () =>
    new Date().getTime().toString(36) + Math.random().toString(36).slice(2)
  const FOOD_LABELS =
    '🍇 Grapes.🍈 Melon.🍉 Watermelon.🍊 Tangerine.🍋 Lemon.🍌 Banana.🍍 Pineapple.🥭 Mango.🍎 Red Apple.🍏 Green Apple.🍐 Pear.🍑 Peach.🍒 Cherries.🍓 Strawberry.🫐 Blueberries.🥝 Kiwi Fruit.🍅 Tomato.🫒 Olive.🥥 Coconut.🥑 Avocado.🍆 Eggplant.🥔 Potato.🥕 Carrot.🌽 Ear of Corn.🌶️ Hot Pepper.🫑 Bell Pepper.🥒 Cucumber.🥬 Leafy Green.🥦 Broccoli.🧄 Garlic.🧅 Onion.🍄 Mushroom.🥜 Peanuts.🌰 Chestnut.🍞 Bread.🥐 Croissant.🥖 Baguette Bread.🫓 Flatbread.🥨 Pretzel.🥯 Bagel.🥞 Pancakes.🧇 Waffle.🧀 Cheese Wedge.🍖 Meat on Bone.🍗 Poultry Leg.🥩 Cut of Meat.🥓 Bacon.🍔 Hamburger.🍟 French Fries.🍕 Pizza.🌭 Hot Dog.🥪 Sandwich.🌮 Taco.🌯 Burrito.🫔 Tamale.🥙 Stuffed Flatbread.🧆 Falafel.🥚 Egg.🍳 Cooking.🥘 Shallow Pan of Food.🍲 Pot of Food.🫕 Fondue.🥣 Bowl with Spoon.🥗 Green Salad.🍿 Popcorn.🧈 Butter.🧂 Salt.🥫 Canned Food.🍱 Bento Box.🍘 Rice Cracker.🍙 Rice Ball.🍚 Cooked Rice.🍛 Curry Rice.🍜 Steaming Bowl.🍝 Spaghetti.🍠 Roasted Sweet Potato.🍢 Oden.🍣 Sushi.🍤 Fried Shrimp.🍥 Fish Cake with Swirl.🥮 Moon Cake.🍡 Dango.🥟 Dumpling.🥠 Fortune Cookie.🥡 Takeout Box.🦪 Oyster.🍦 Soft Ice Cream.🍧 Shaved Ice.🍨 Ice Cream.🍩 Doughnut.🍪 Cookie.🎂 Birthday Cake.🍰 Shortcake.🧁 Cupcake.🥧 Pie.🍫 Chocolate Bar.🍬 Candy.🍭 Lollipop.🍮 Custard.🍯 Honey Pot.🍼 Baby Bottle.🥛 Glass of Milk.☕ Hot Beverage.🫖 Teapot.🍵 Teacup Without Handle.🍶 Sake.🍾 Bottle with Popping Cork.🍷 Wine Glass.🍸 Cocktail Glass.🍹 Tropical Drink.🍺 Beer Mug.🍻 Clinking Beer Mugs.🥂 Clinking Glasses.🥃 Tumbler Glass.🥤 Cup with Straw.🧋 Bubble Tea.🧃 Beverage Box.🧉 Mate.🧊 Ice.🥢 Chopsticks.🍽️ Fork and Knife with Plate.🍴 Fork and Knife.🥄 Spoon'.split(
      '.',
    )
  const randomFoodLabel = () => FOOD_LABELS[Math.floor(Math.random() * FOOD_LABELS.length)]!
  /**
   * 点击末端加号后，将该占位节点转换为带随机标签的 workflow 节点。
   * 原有入边同步转换为 workflow 边，再追加一个新的占位节点及连接，维持可继续扩展的末端。
   * 所有新节点继承当前占位位置，后续由布局动画分配最终位置；节点不存在时忽略操作。
   */
  function useActivatePlaceholder(placeholderNodeId: string) {
    const { getNode, setNodes, setEdges } = useReactFlow<WorkflowNode, Edge>()
    return () => {
      const placeholderNode = getNode(placeholderNodeId)
      if (!placeholderNode) {
        return
      }
      const nextPlaceholderId = createWorkflowId()
      const nextPlaceholderNode = {
        id: nextPlaceholderId,
        position: {
          x: placeholderNode.position.x,
          y: placeholderNode.position.y,
        },
        type: 'placeholder',
        data: {
          label: '+',
        },
      }
      const nextPlaceholderEdge = {
        id: `${placeholderNode.id}=>${nextPlaceholderId}`,
        source: placeholderNode.id,
        target: nextPlaceholderId,
        type: 'placeholder',
      }
      setNodes((currentNodes) =>
        currentNodes
          .map((currentNode) =>
            currentNode.id === placeholderNodeId
              ? {
                  ...currentNode,
                  type: 'workflow',
                  data: {
                    label: randomFoodLabel(),
                  },
                }
              : currentNode,
          )
          .concat([nextPlaceholderNode]),
      )
      setEdges((currentEdges) =>
        currentEdges
          .map((currentEdge) =>
            currentEdge.target === placeholderNodeId
              ? {
                  ...currentEdge,
                  type: 'workflow',
                }
              : currentEdge,
          )
          .concat([nextPlaceholderEdge]),
      )
    }
  }
  const PlaceholderNode = React.memo(({ id: nodeId, data: nodeData }: NodeProps<WorkflowNode>) => (
    <div onClick={useActivatePlaceholder(nodeId)} title="click to add a node">
      {nodeData.label}
      <Handle type="target" position={Position.Top} isConnectable={false} />
      <Handle type="source" position={Position.Bottom} isConnectable={false} />
    </div>
  ))
  /**
   * 为当前 workflow 节点增加一个普通子节点，并给新子节点追加末端占位节点。
   * 先通过 getOutgoers 找出父节点已有的占位分支，删除这些占位节点及其入边。
   * 保留父节点已有的真实分支，再同时追加两节点、两条边，使树结构始终完整。
   */
  function useAddWorkflowChild(parentNodeId: string) {
    const { setEdges, setNodes, getNodes, getEdges, getNode } = useReactFlow<WorkflowNode, Edge>()
    return React.useCallback(() => {
      const parentNode = getNode(parentNodeId)
      if (!parentNode) {
        return
      }
      const childNodeId = createWorkflowId()
      const placeholderNodeId = createWorkflowId()
      const childNode = {
        id: childNodeId,
        position: {
          x: parentNode.position.x,
          y: parentNode.position.y + 150,
        },
        type: 'workflow',
        data: {
          label: randomFoodLabel(),
        },
      }
      const placeholderNode = {
        id: placeholderNodeId,
        position: {
          x: childNode.position.x,
          y: childNode.position.y + 150,
        },
        type: 'placeholder',
        data: {
          label: '+',
        },
      }
      const parentToChildEdge = {
        id: `${parentNode.id}=>${childNodeId}`,
        source: parentNode.id,
        target: childNodeId,
        type: 'workflow',
      }
      const childToPlaceholderEdge = {
        id: `${childNodeId}=>${placeholderNodeId}`,
        source: childNodeId,
        target: placeholderNodeId,
        type: 'placeholder',
      }
      const replacedPlaceholderIds = getOutgoers(parentNode, getNodes(), getEdges())
        .filter((outgoingNode) => outgoingNode.type === 'placeholder')
        .map((placeholderNode) => placeholderNode.id)
      setNodes((currentNodes) =>
        currentNodes
          .filter((currentNode) => !replacedPlaceholderIds.includes(currentNode.id))
          .concat([childNode, placeholderNode]),
      )
      setEdges((currentEdges) =>
        currentEdges
          .filter((currentEdge) => !replacedPlaceholderIds.includes(currentEdge.target))
          .concat([parentToChildEdge, childToPlaceholderEdge]),
      )
    }, [getEdges, getNode, getNodes, parentNodeId, setEdges, setNodes])
  }
  const WORKFLOW_NODE_TYPES = {
    placeholder: PlaceholderNode,
    workflow: React.memo(({ id: nodeId, data: nodeData }: NodeProps<WorkflowNode>) => (
      <div onClick={useAddWorkflowChild(nodeId)} title="click to add a child node">
        {nodeData.label}
        <Handle type="target" position={Position.Top} isConnectable={false} />
        <Handle type="source" position={Position.Bottom} isConnectable={false} />
      </div>
    )),
  }
  /* 占位边只根据端点和方向生成贝塞尔曲线路径。 */
  function PlaceholderEdge({
    id: edgeId,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    style,
    markerEnd,
  }: EdgeProps) {
    const [edgePath] = getBezierPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
    })
    return (
      <BaseEdge
        id={edgeId}
        style={style}
        path={edgePath}
        {...(markerEnd === undefined ? {} : { markerEnd })}
      />
    )
  }
  /**
   * 在指定边的源与目标之间插入节点，不改变原目标的后续分支。
   * 先确认边与目标仍然存在，再用 source→inserted、inserted→target 替换原边。
   * 新节点放在节点数组的原目标之前，并暂时使用目标坐标，等待树布局产生动画。
   */
  function useInsertWorkflowNode(edgeId: string) {
    const { setEdges, setNodes, getNode, getEdge } = useReactFlow<WorkflowNode, Edge>()
    return () => {
      const originalEdge = getEdge(edgeId)
      if (!originalEdge) {
        return
      }
      const targetNode = getNode(originalEdge.target)
      if (!targetNode) {
        return
      }
      const insertedNodeId = createWorkflowId()
      const insertedNode = {
        id: insertedNodeId,
        position: {
          x: targetNode.position.x,
          y: targetNode.position.y,
        },
        data: {
          label: randomFoodLabel(),
        },
        type: 'workflow',
      }
      const sourceToInsertedEdge = {
        id: `${originalEdge.source}->${insertedNodeId}`,
        source: originalEdge.source,
        target: insertedNodeId,
        type: 'workflow',
      }
      const insertedToTargetEdge = {
        id: `${insertedNodeId}->${originalEdge.target}`,
        source: insertedNodeId,
        target: originalEdge.target,
        type: 'workflow',
      }
      setEdges((currentEdges) =>
        currentEdges
          .filter((currentEdge) => currentEdge.id !== edgeId)
          .concat([sourceToInsertedEdge, insertedToTargetEdge]),
      )
      setNodes((currentNodes) => {
        const targetNodeIndex = currentNodes.findIndex(
          (currentNode) => currentNode.id === originalEdge.target,
        )
        return [
          ...currentNodes.slice(0, targetNodeIndex),
          insertedNode,
          ...currentNodes.slice(targetNodeIndex, currentNodes.length),
        ]
      })
    }
  }
  /* 使用贝塞尔路径返回的标签坐标定位加号按钮；点击按钮将当前边拆成两段。 */
  function WorkflowEdge({
    id: edgeId,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    style,
    markerEnd,
  }: EdgeProps) {
    const insertWorkflowNode = useInsertWorkflowNode(edgeId)
    const [edgePath, labelX, labelY] = getBezierPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
    })
    return (
      <React.Fragment>
        <BaseEdge
          id={edgeId}
          style={style}
          path={edgePath}
          {...(markerEnd === undefined ? {} : { markerEnd })}
        />
        <EdgeLabelRenderer>
          <button
            style={{
              transform: `translate(${labelX}px, ${labelY}px) translate(-50%, -50%)`,
            }}
            onClick={insertWorkflowNode}
            className="edge-button nodrag nopan"
          >
            {'+'}
          </button>
        </EdgeLabelRenderer>
      </React.Fragment>
    )
  }
  const WORKFLOW_EDGE_TYPES = {
    placeholder: PlaceholderEdge,
    workflow: WorkflowEdge,
  }
  const PRO_OPTIONS = {
    account: 'paid-pro',
    hideAttribution: true,
  }
  const INITIAL_NODES: WorkflowNode[] = [
    {
      id: '1',
      data: {
        label: '🌮 Taco',
      },
      position: {
        x: 0,
        y: 0,
      },
      type: 'workflow',
    },
    {
      id: '2',
      data: {
        label: '+',
      },
      position: {
        x: 0,
        y: 150,
      },
      type: 'placeholder',
    },
  ]
  const INITIAL_EDGES: Edge[] = [
    {
      id: '1=>2',
      source: '1',
      target: '2',
      type: 'placeholder',
    },
  ]
  const FIT_VIEW_OPTIONS = {
    padding: 0.1,
  }
  function DynamicLayoutingFlow() {
    useWorkflowLayout()
    return (
      <React.Fragment>
        <ReactFlow
          defaultNodes={INITIAL_NODES}
          defaultEdges={INITIAL_EDGES}
          proOptions={PRO_OPTIONS}
          fitView
          nodeTypes={WORKFLOW_NODE_TYPES}
          edgeTypes={WORKFLOW_EDGE_TYPES}
          fitViewOptions={FIT_VIEW_OPTIONS}
          minZoom={0.2}
          nodesDraggable={false}
          nodesConnectable={false}
          zoomOnDoubleClick={false}
          deleteKeyCode={null}
          colorMode="system"
        >
          <Background />
        </ReactFlow>
      </React.Fragment>
    )
  }
  function DynamicLayoutingExample() {
    return (
      <ReactFlowProvider>
        <DynamicLayoutingFlow />
      </ReactFlowProvider>
    )
  }
  const initialElement = (
    <React.StrictMode>
      <DynamicLayoutingExample />
    </React.StrictMode>
  )
  return function ExampleRoot() {
    return initialElement
  }
}
function DynamicLayoutingCanvas() {
  // 惰性保存组件类型，使普通重渲染沿用同一份图状态；工作台重置时重新挂载。
  const [Example] = React.useState(createExampleScope)
  return <Example />
}
export { DynamicLayoutingCanvas as default }
