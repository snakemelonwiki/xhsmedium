module.exports = {
  apps: [
    {
      name: "lan-system",
      script: "server.js",
      cwd: "/var/www/lan-system",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: 3000
      }
    }
  ]
};

