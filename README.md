# 序时

一个面向个人使用的事项规划系统，把领域、目标、项目、普通任务和循环任务组织到同一套时间与完成规则中。

## 当前版本

- 今日任务、逾期任务、近期任务和总事项安排；
- PC 侧栏与移动端底部导航；
- 领域、目标、项目和任务的新增；
- 任务完成、取消和重新打开；
- 每 N 天、每 N 周循环；
- 循环实例历史补齐与逾期保留；
- 目标、项目和直接任务层级；
- 无日期任务筛选和上层日期边界校验；
- D1 持久化及初始化示例数据；
- 访问 Token 登录、签名会话和服务端接口保护。

完整产品规则见 [产品与领域设计](docs/product-design.md)。

## 本地运行

```bash
npm install
npm run db:setup:local
npm run auth:setup
npm run dev
```

`db:setup:local` 只需在首次创建本地数据库时执行：它先创建表，再将演示数据显式写入数据库。应用运行时不会自动创建演示数据。之后直接启动即可。打开
`http://localhost:3000`。

`auth:setup` 会使用密码学安全随机数自动生成访问 Token 和会话密钥，并将它们保存到被 Git 忽略的 `.dev.vars`。不需要手工填写随机字符串。

```bash
npm run auth:show    # 查看当前本地访问 Token
npm run auth:rotate  # 重新生成 Token 和会话密钥
```

`.dev.vars` 是持久的本地密钥文件，不是公网生产配置，也不是需要提交的业务文件。本地生产构建启动时会把它复制到被忽略的 `dist/server/.dev.vars`，后者只是 Wrangler 本地运行所需的临时副本。

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

## 公网安全配置

公网环境必须全程使用 HTTPS，并将 `ACCESS_TOKEN` 和 `SESSION_SECRET` 配置为部署平台的服务器密钥，不能放入前端代码、URL、镜像或 Git。Cloudflare Workers 可分别执行：

```bash
npx wrangler secret put ACCESS_TOKEN
npx wrangler secret put SESSION_SECRET
```

登录成功后，服务器签发 7 天有效的 HMAC 会话 Cookie。公网 Cookie 使用 `Secure`、`HttpOnly`、`SameSite=Strict` 和 `__Host-` 前缀；原始访问 Token 不写入 Cookie 或浏览器存储。修改 Token 会阻止新的旧 Token 登录，修改 `SESSION_SECRET` 会立即让所有现有会话失效。

公网入口还应限制登录接口的请求频率，并定期导出数据库备份。仓库中的 `_headers` 已启用 HSTS、禁止嵌入及基础浏览器安全响应头。

## 检查

```bash
npx tsc --noEmit
npm run lint
npm run build
```

数据库结构由 `db/schema.ts` 定义，迁移文件位于 `drizzle/`。修改结构后使用 `npm run db:generate -- --name <migration-name>` 生成新迁移，不要修改已经应用的迁移文件。
演示数据位于 `db/seed-demo.sql`，需要时可通过 `npm run db:seed:local` 显式写入；该命令不会覆盖已有记录。
