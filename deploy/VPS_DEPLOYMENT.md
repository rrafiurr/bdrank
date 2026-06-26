# VPS Deployment Guide

| | |
|---|---|
| **Domain** | `bdranks.com` (Namecheap → Cloudflare) |
| **VPS IP** | `176.57.189.163` (Contabo) |
| **GitHub** | `https://github.com/rrafiurr/bdrank.git` |

Subdomains:
- `bdranks.com` — Frontend (React SPA)
- `api.bdranks.com` — Backend (Go API)
- `cms.bdranks.com` — CMS (React SPA)

---

## Architecture

```
Internet (HTTPS)
      │
  Cloudflare  ← proxies traffic, global CDN + DDoS protection
      │
   Nginx on VPS 176.57.189.163  ← SSL via Cloudflare Origin Cert
      │
      ├── bdranks.com       → /var/www/reviewhub/fe/   (static files)
      ├── api.bdranks.com   → 127.0.0.1:8080           (Go API in Docker)
      └── cms.bdranks.com   → /var/www/reviewhub/cms/  (static files)

Docker (internal only)
      ├── api   → :8080
      ├── mysql → internal
      └── redis → internal
```

---

## Step 1 — Point Namecheap to Cloudflare

You said the domain is already going through Cloudflare. If not done yet:

1. Log in to Namecheap → Domain List → Manage `bdranks.com`
2. Under **Nameservers**, select **Custom DNS**
3. Enter the two Cloudflare nameservers Cloudflare gave you (e.g. `aria.ns.cloudflare.com`, `brad.ns.cloudflare.com`)
4. Save — propagation takes up to 24 hours

---

## Step 2 — DNS Records in Cloudflare

In Cloudflare dashboard → `bdranks.com` → DNS → Records, add:

| Type | Name | Content | Proxy |
|---|---|---|---|
| A | `@` | `176.57.189.163` | **Proxied** (orange) |
| A | `www` | `176.57.189.163` | **Proxied** (orange) |
| A | `api` | `176.57.189.163` | **Proxied** (orange) |
| A | `cms` | `176.57.189.163` | **Proxied** (orange) |

Then go to **SSL/TLS** → set encryption mode to **Full (strict)**.

---

## Step 3 — Cloudflare Origin Certificate (replaces Let's Encrypt)

Because Cloudflare proxies all traffic, Certbot cannot validate your domain directly. Use a Cloudflare **Origin Certificate** instead — it's free and lasts 15 years.

In Cloudflare → SSL/TLS → **Origin Server** → Create Certificate:

- Hostnames: `bdranks.com`, `*.bdranks.com`
- Key type: RSA (2048)
- Validity: 15 years

Cloudflare shows you two values. On the VPS, save them:

```bash
sudo mkdir -p /etc/ssl/cloudflare

# Paste the certificate content
sudo nano /etc/ssl/cloudflare/bdranks.com.pem

# Paste the private key content
sudo nano /etc/ssl/cloudflare/bdranks.com.key

sudo chmod 600 /etc/ssl/cloudflare/bdranks.com.key
```

---

## Step 4 — Server First-Time Setup

SSH in as root, then run:

```bash
ssh root@176.57.189.163

# Create a non-root deploy user
adduser deploy
usermod -aG sudo deploy
su - deploy

# Firewall — SSH, HTTP, HTTPS only
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable

# Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker deploy
newgrp docker

# Nginx, git, rsync, Node.js 22
sudo apt update
sudo apt install -y nginx rsync git

curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# Verify
docker --version && nginx -v && node --version
```

---

## Step 5 — Clone the Repository

```bash
cd /home/deploy
git clone https://github.com/rrafiurr/bdrank.git reviewhub
cd reviewhub
```

---

## Step 6 — Create Production Environment File

```bash
cd /home/deploy/reviewhub/be
cp .env.prod.example .env.prod
nano .env.prod
```

Generate a JWT secret:
```bash
openssl rand -hex 32
```

Fill in every `CHANGE_TO_*` value. The URL fields are already correct:

```env
BASE_URL=https://api.bdranks.com
SITE_URL=https://bdranks.com
ALLOWED_ORIGINS=https://bdranks.com,https://www.bdranks.com,https://cms.bdranks.com
```

For social login, also set in `.env.prod`:

```env
GOOGLE_CLIENT_ID=...
FACEBOOK_APP_ID=...
FACEBOOK_APP_SECRET=...
```

---

## Step 7 — Configure Nginx with Cloudflare Origin Cert

Update the Nginx config to use HTTPS with the Cloudflare origin certificate:

```bash
sudo cp /home/deploy/reviewhub/deploy/nginx/reviewhub.conf \
        /etc/nginx/sites-available/reviewhub
```

Then open it and add SSL — replace the entire file with this:

```bash
sudo nano /etc/nginx/sites-available/reviewhub
```

```nginx
# ── Frontend (bdranks.com) ────────────────────────────────────────────────────
server {
    listen 80;
    server_name bdranks.com www.bdranks.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name bdranks.com www.bdranks.com;

    ssl_certificate     /etc/ssl/cloudflare/bdranks.com.pem;
    ssl_certificate_key /etc/ssl/cloudflare/bdranks.com.key;

    root /var/www/reviewhub/fe;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location ~* \.(js|css|woff2?|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location ~* \.(png|jpg|jpeg|gif|svg|ico|webp)$ {
        expires 30d;
        add_header Cache-Control "public";
    }
}

# ── API (api.bdranks.com) ─────────────────────────────────────────────────────
server {
    listen 80;
    server_name api.bdranks.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name api.bdranks.com;

    ssl_certificate     /etc/ssl/cloudflare/bdranks.com.pem;
    ssl_certificate_key /etc/ssl/cloudflare/bdranks.com.key;

    client_max_body_size 20M;

    location / {
        proxy_pass         http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }
}

# ── CMS (cms.bdranks.com) ─────────────────────────────────────────────────────
server {
    listen 80;
    server_name cms.bdranks.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name cms.bdranks.com;

    ssl_certificate     /etc/ssl/cloudflare/bdranks.com.pem;
    ssl_certificate_key /etc/ssl/cloudflare/bdranks.com.key;

    root /var/www/reviewhub/cms;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location ~* \.(js|css|woff2?|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location ~* \.(png|jpg|jpeg|gif|svg|ico|webp)$ {
        expires 30d;
        add_header Cache-Control "public";
    }
}
```

Enable and test:

```bash
sudo ln -s /etc/nginx/sites-available/reviewhub \
           /etc/nginx/sites-enabled/reviewhub

sudo nginx -t
sudo systemctl reload nginx
```

---

## Step 8 — First Deploy

```bash
cd /home/deploy/reviewhub
./deploy/deploy.sh
```

This automatically uses `https://api.bdranks.com/api/v1` as the API URL. Watch it start:

```bash
docker compose -f be/docker-compose.prod.yml logs -f
```

---

## Step 9 — Database Migrations

On first boot MySQL auto-runs all files in `be/migrations/`. For new migrations later:

```bash
source <(grep DB_PASSWORD /home/deploy/reviewhub/be/.env.prod)

docker compose -f /home/deploy/reviewhub/be/docker-compose.prod.yml \
  exec mysql \
  mysql -u reviewhub -p"$DB_PASSWORD" reviewhub \
  < /home/deploy/reviewhub/be/migrations/005_your_migration.sql
```

---

## Step 10 — Verify

```bash
# All containers running?
docker compose -f be/docker-compose.prod.yml ps

# API responding?
curl https://api.bdranks.com/api/v1/stats

# Frontend serving?
curl -I https://bdranks.com

# CMS serving?
curl -I https://cms.bdranks.com
```

---

## CI/CD — Auto Deploy on Push to `deploy` Branch

The workflow file `.github/workflows/deploy.yml` is already in the repo. Every push to the `deploy` branch triggers a deploy.

### One-time setup

**On your local machine**, generate a dedicated SSH key pair for CI:

```bash
ssh-keygen -t ed25519 -C "github-ci-deploy" -f ~/.ssh/bdranks_deploy -N ""
```

**On the VPS**, add the public key:

```bash
# Run as the deploy user on the VPS
mkdir -p ~/.ssh
echo "<paste contents of ~/.ssh/bdranks_deploy.pub here>" >> ~/.ssh/authorized_keys
chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys
```

Test it from your local machine first:

```bash
ssh -i ~/.ssh/bdranks_deploy deploy@176.57.189.163 "cd /home/deploy/reviewhub && git status"
```

**In GitHub** → `https://github.com/rrafiurr/bdrank` → Settings → Secrets and variables → Actions → add:

| Secret | Value |
|---|---|
| `VPS_HOST` | `176.57.189.163` |
| `VPS_USER` | `deploy` |
| `VPS_SSH_KEY` | Full contents of `~/.ssh/bdranks_deploy` (private key) |
| `API_URL` | `https://api.bdranks.com/api/v1` |

### How to trigger a deploy

```bash
git checkout deploy
git merge main          # merge your changes in
git push origin deploy  # GitHub Actions fires automatically
```

Watch the run at:
`https://github.com/rrafiurr/bdrank/actions`

### Partial deploys

```bash
# Backend only (Go code changed)
./deploy/deploy.sh --skip-frontend

# Frontend only (React code changed)
./deploy/deploy.sh --skip-backend
```

---

## Google Reviews Import

```bash
node /home/deploy/reviewhub/scripts/fetch-google-reviews.mjs \
  --place-name "Your Business Name" \
  --product-id 3 \
  --serpapi-key YOUR_SERPAPI_KEY \
  --api-url https://api.bdranks.com \
  --api-pass YOUR_EXTERNAL_PASS \
  --limit 100
```

---

## Troubleshooting

### API returns 502 Bad Gateway

Go container is not running:

```bash
docker compose -f be/docker-compose.prod.yml ps
docker compose -f be/docker-compose.prod.yml logs api
curl http://127.0.0.1:8080/api/v1/stats   # test from VPS directly
```

### Cloudflare shows "SSL handshake failed"

SSL/TLS mode in Cloudflare must be **Full (strict)** — not Flexible. Also confirm the cert files are in `/etc/ssl/cloudflare/` and Nginx config points to them correctly.

### "Error establishing database connection" in API logs

MySQL not healthy yet (first boot takes ~30 seconds). Wait and check:

```bash
docker compose -f be/docker-compose.prod.yml logs mysql
```

### Env vars not picked up after editing `.env.prod`

`docker restart` does NOT re-read env files. Always use:

```bash
docker compose -f be/docker-compose.prod.yml up -d --force-recreate
```

### Frontend shows old version after deploy

This is always a local browser cache issue. Vite hashes all JS/CSS filenames so the server is always serving fresh files. Open incognito or hard-refresh.

---

## File Reference

| File | Purpose |
|---|---|
| `.github/workflows/deploy.yml` | GitHub Actions CI/CD — auto deploy on push to `deploy` branch |
| `be/docker-compose.prod.yml` | Production Docker Compose (API + MySQL + Redis) |
| `be/.env.prod.example` | Template for production secrets — copy to `.env.prod` |
| `be/.env.prod` | Actual secrets — never commit, in `.gitignore` |
| `deploy/nginx/reviewhub.conf` | Nginx virtual hosts (HTTP only — see Step 7 for HTTPS version) |
| `deploy/deploy.sh` | One-command deploy script |
| `scripts/fetch-google-reviews.mjs` | Google Reviews import script |
