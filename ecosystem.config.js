module.exports = {
  apps: [
    {
      name: "lan-backend",
      cwd: "/opt/lan-system/backend",
      script: "dist/main.js",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: 9099
      }
    },
    {
      name: "lan-frontend",
      cwd: "/opt/lan-system/frontend",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3302",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        NEXT_PUBLIC_BACKEND_URL: "http://127.0.0.1:9099"
      }
    },
    {
      name: "lan-cookie-refresh",
      cwd: "/opt/lan-system",
      script: "scripts/cookie-refresh.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production"
      }
    },
    {
      name: "lan-posts-metrics-refresh",
      cwd: "/opt/lan-system",
      script: "scripts/posts-metrics-refresh.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};
