# 序时

一个面向个人使用的事项规划系统，把领域、目标、项目、普通任务和循环任务组织到同一套时间与完成规则中。

## 当前版本

- 今日任务、逾期任务、近期任务和总事项安排；
- PC 侧栏与移动端底部导航；
- 任务新增、完成、取消和重新打开；
- 每 N 天、每 N 周循环；
- 循环实例历史补齐与逾期保留；
- 目标、项目和直接任务层级；
- 无日期任务筛选和上层日期边界校验；
- D1 持久化及初始化示例数据。

完整产品规则见 [产品与领域设计](docs/product-design.md)。

## 本地运行

```bash
npm install
npm run db:setup:local
npm run dev
```

`db:setup:local` 只需在首次创建本地数据库时执行：它先创建表，再将演示数据显式写入数据库。应用运行时不会自动创建演示数据。之后直接启动即可。打开
`http://localhost:3000`。

## 局域网运行

开发模式（支持代码修改后自动刷新）：

```bash
npm run dev:lan
```

生产构建模式：

```bash
npm run build
npm run start:lan
```

同一局域网内的设备访问 `http://<运行电脑的局域网 IP>:3000`。服务会监听
`0.0.0.0`，首次启动时如果 macOS 弹出防火墙提示，需要允许 Node.js 接受传入连接。

## 检查

```bash
npx tsc --noEmit
npx oxlint app/page.tsx app/api components/planner lib
npm run build
```

数据库结构由 `db/schema.ts` 定义，迁移文件位于 `drizzle/`。修改结构后使用 `npm run db:generate -- --name <migration-name>` 生成新迁移，不要修改已经应用的迁移文件。
演示数据位于 `db/seed-demo.sql`，需要时可通过 `npm run db:seed:local` 显式写入；该命令不会覆盖已有记录。
