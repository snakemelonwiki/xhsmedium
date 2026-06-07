# 步骤 5:Nginx 反代 + HTTPS

> 配合 `deploy-app.sh` 启的 PM2,把 80/443 入口给到员工/主管。

## 一键配置

```bash
# 1) 复制 nginx 模板
sudo cp /var/www/lan-system/docs/deploy/nginx/lan-system.conf /etc/nginx/conf.d/lan-system.conf

# 2) 把 your-domain.com 改成你的真实域名
sudo sed -i 's/your-domain.com/你的域名.com/g' /etc/nginx/conf.d/lan-system.conf

# 3) 验证 + 重载
sudo nginx -t
sudo systemctl reload nginx

# 4) (首次)申请 Let's Encrypt 证书
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d 你的域名.com
```

## nginx 模板

`docs/deploy/nginx/lan-system.conf`(已带 80→443 重定向 + WebSocket 升级 + 限流):

```nginx
# 把 server_name 改成你的真实域名
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    # 证书由 certbot 自动管理
    ssl_certificate     /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    # 通用安全头
    add_header X-Frame-Options SAMEORIGIN;
    add_header X-Content-Type-Options nosniff;
    add_header Referrer-Policy strict-origin-when-cross-origin;

    # 上传文件大小(后端 multer 上限)
    client_max_body_size 20m;

    # 静态资源(Next.js / 老 public/)
    location /_next/static/ {
        alias /var/www/lan-system/frontend/.next/static/;
        expires 30d;
        access_log off;
    }
    location /uploads/ {
        alias /var/www/lan-system/uploads/;
        expires 7d;
    }

    # 反代到 NestJS API
    location /api/ {
        proxy_pass http://127.0.0.1:8089;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Origin-Port 443;
        proxy_read_timeout 60s;
    }

    # 反代到 Socket.IO
    location /socket.io/ {
        proxy_pass http://127.0.0.1:8089;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    # 反代到 legacy :3000(老 public/app.js)
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

## 关键点

- **443 走 legacy :3000**(老 public/app.js),不是 Next.js
- Next.js 静态文件直接由 nginx serve(`/frontend/.next/static/`)
- WebSocket 升级:必须 `Upgrade $http_upgrade` + `Connection "upgrade"`
- `X-Origin-Port` 头:让后端知道是经 80/443 来的,而不是直连 8089
- 证书:certbot 自动续期,加一行到 crontab:
  ```bash
  0 3 * * * certbot renew --quiet && systemctl reload nginx
  ```

## 防火墙

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow OpenSSH   # 别把自己锁出去
sudo ufw enable
sudo ufw status
```

**不要**开 8089 / 3000 / 3302(只 nginx 暴露的 80/443 给公网)。

## 验证

```bash
# nginx 语法
sudo nginx -t

# 健康检查
curl -I https://your-domain.com
curl -I https://your-domain.com/api/auth/me

# 跨域(可选)
curl -H "Origin: https://other.com" -I https://your-domain.com
```

期望:HTTP/2 200 / 401(401 是因为没带 token,正常)。
