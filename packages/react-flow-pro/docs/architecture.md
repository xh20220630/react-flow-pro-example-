# 官方依赖与运行架构

## 一份官方 React Flow

根目录 Next.js 应用与 Pro 包使用相同版本的 `@xyflow/react@12.12.0`。Pro 包将其声明为 peer dependency，并以同版本 dev dependency 开发；所有功能从 `@xyflow/react` 公开入口导入组件、hooks、枚举和工具。pnpm workspace 共享依赖版本，Next.js 用 `transpilePackages` 编译本地功能包。

库构建把 peer dependencies 与正常 dependencies 全部设为 external。发布的 Pro 代码保留普通包导入，不把 React Flow、D3、ELK、Yjs 等打成私有副本。调用方安装依赖后由其构建工具统一解析。这样 Pro 功能使用的 React Flow 上下文来自宿主安装的同一份官方模块。

官方 Provider 用法见 [ReactFlowProvider](https://reactflow.dev/api-reference/react-flow-provider)。每个当前公开示例管理自己的 Provider 和图状态，调用方负责容器尺寸；两个独立画布可以使用同一官方模块，同时保有独立状态。

## 功能代码的职责

`src/examples` 实现节点、边、编辑事件与布局协调。每个模块的 `createExampleScope` 为当前挂载创建初始数据、可变缓存和局部 store，最后返回固定组件树。默认 Canvas 用 `useState` 保存这一实例，避免父组件重渲染时重建图状态。

正常 npm 算法包承担基础计算：D3 负责树、动画时钟和力模拟；Dagre、ELK 负责自动布局；perfect-freehand 负责轮廓；perfect-cursors 负责光标插值；libavoid-js 负责正交避障。图结构操作、坐标转换、控制点编辑、历史与分组规则由本包可读源码承担。

## 样式与 WASM

基础样式通过 `@xyflow/react/dist/style.css` 引入。统一入口 `src/styles/index.css` 引入基础样式、共享主题和所有功能样式，使用已有的示例作用域隔离；没有另一份捕获版 React Flow 基础样式。宿主 reset 使用零 specificity，保持官方 `.react-flow` 规则的优先级。

`edge-routing.tsx` 从安装的 `libavoid-js` 包定位 WASM，应用构建工具输出静态资源并生成部署地址；独立功能包使用 Vite 构建。该文件是算法包的二进制资源，与 JS glue 版本配对；不在本包中复制 JS glue，也不要求调用方访问示例网站下载资源。

## 参数与协作

参数面板使用 Leva 的 `useCreateStore`、`useControls` 与 `LevaPanel` 公共导出。`LayoutControlsProvider` 每次挂载创建独立 store，三个布局功能通过同一 Context 注册和显示参数，不再导出或调用库内部构造器。

协作通过 `src/collaboration/websocket-provider.ts` 创建官方 `WebsocketProvider`，连接当前域名的 `/collaboration/<房间 ID>`。禁用 BroadcastChannel 后，同浏览器标签页、独立浏览器和跨设备使用完全相同的网络同步路径。收到服务端 `sync` 回复后才进入房间；首次失败或超时显示错误并释放会话，已加入房间的连接断开后由 Provider 自动重连并合并本地修改。

宿主 `src/server/index.ts` 使用 Node 24 运行 TypeScript 自定义服务器，HTTP 页面仍由 Next.js App Router 处理，`src/server/collaboration.ts` 将 WebSocket Upgrade 交给官方 `@y/websocket-server/utils`。开发热更新的 Upgrade 继续由 Next.js 自身处理。客户端不需要访问其他端口或第三方服务器。

服务器按房间创建 Y.Doc，并在同步客户端前一次性生成初始节点；客户端加入不写入初始化数据。节点与边使用 Yjs Maps，测量和选中状态由本机投影缓存保存，在线身份、光标和连接草稿使用 Awareness。退出或异常断线移除该连接的在线状态，不把临时光标保存在图文档中。

房间文档保留在服务进程内存，所有人退出、刷新或重新加入仍能获取相同状态；服务重启后清空。当前示例没有数据库持久化或登录权限系统。部署反向代理需转发 `/collaboration/*` 的 WebSocket Upgrade。服务端图片生成仍不在本项目范围内。

## 维护边界

`src` 是手工维护的代码，构建只做类型、样式和 ESM 输出，不重生成源码。历史参考资料不属于本仓库，不参与构建和运行。源码导入规则禁止引用 vendor、recovery 和 artifacts。

## Next.js 浏览器边界

`src/app/page.tsx` 渲染应用 Client Component 入口，`next/dynamic` 关闭工作台的服务端渲染。浏览器挂载后读取 hash，选择懒加载模块并建立独立 Provider 与图状态；不会在构建预渲染阶段执行 `location` 或创建 BroadcastChannel。
