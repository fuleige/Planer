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
npm run db:migrate:local
npm run dev
```

打开 `http://localhost:3000`。

## 检查

```bash
npx tsc --noEmit
npx oxlint app/page.tsx app/api components/planner lib
npm run build
```

数据库结构由 `db/schema.ts` 定义，迁移文件位于 `drizzle/`。修改结构后使用 `npm run db:generate -- --name <migration-name>` 生成新迁移，不要修改已经应用的迁移文件。
