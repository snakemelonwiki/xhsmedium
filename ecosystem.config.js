module.exports = {
  apps: [
    {
      name: "lan-main-port",
      script: "server.js",
      cwd: "/var/www/lan-system",
      instances: 1,
      exec_mode: "fork",
      // v1.3（2026-06-04）：server.js 同进程内会监听 PORT / OWNER_PORT / ALL_ROLES_PORT
      // 三个端口（3000 / 3001 / 3003），PM2 两实例互为热备。
      // 3002 被新前端 Next.js (frontend/package.json dev/start) 占用，本进程不可占用。
      env: {
        NODE_ENV: "production",
        PORT: 3000,
        OWNER_PORT: 3001,
        ALL_ROLES_PORT: 3003
      }
    },
    {
      name: "lan-owner-port",
      script: "server.js",
      cwd: "/var/www/lan-system",
      instances: 1,
      exec_mode: "fork",
      // 注：当前 server.js 仍以「PORT 启动主 app，OWNER_PORT 启动 owner app，
      // ALL_ROLES_PORT 启动统一登录 app」模式工作，所以这一个实例只要端口配置一致
      // 即可让三个端口都被监听。如未来 server.js 改为单端口单 app，本配置可直接废弃。
      env: {
        NODE_ENV: "production",
        PORT: 3000,
        OWNER_PORT: 3001,
        ALL_ROLES_PORT: 3003
      }
    }
  ]
};

