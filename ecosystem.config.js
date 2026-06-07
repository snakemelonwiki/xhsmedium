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
        PORT: 8089
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
        NEXT_PUBLIC_BACKEND_URL: "http://127.0.0.1:8089"
      }
    }
  ]
};
