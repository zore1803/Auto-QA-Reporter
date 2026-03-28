# Running QA Inspector Locally

## Prerequisites

| Tool | Minimum version | Install |
|------|----------------|---------|
| Node.js | 20 | https://nodejs.org |
| pnpm | 9 | `npm install -g pnpm` |
| Git | any | https://git-scm.com |

> **macOS users** — Playwright downloads its own Chromium binary; no extra system packages needed.
> **Linux users** — you may need `libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxrandr2 libgbm1 libasound2` depending on your distro. Run `npx playwright install-deps` after step 3 if Chromium fails to launch.

---

## 1 — Clone and install

```bash
git clone <your-repo-url>
cd <repo-folder>
pnpm install
```

---

## 2 — Environment files

Copy the example env files:

```bash
cp artifacts/api-server/.env.example   artifacts/api-server/.env
cp artifacts/qa-inspector/.env.example artifacts/qa-inspector/.env
```

The defaults work out-of-the-box (API on port 3001, frontend on port 5173).
Edit the files if you need different ports.

---

## 3 — Install Playwright's Chromium browser

```bash
pnpm --filter @workspace/api-server exec playwright install chromium
```

On Linux, also run:
```bash
pnpm --filter @workspace/api-server exec playwright install-deps chromium
```

---

## 4 — Start both services

Open **two terminal tabs**.

**Tab 1 — API server:**
```bash
pnpm --filter @workspace/api-server run dev:local
```

**Tab 2 — Frontend:**
```bash
pnpm --filter @workspace/qa-inspector run dev
```

Then open **http://localhost:5173** in your browser.

---

## How it works locally

- The frontend dev server (Vite, port 5173) automatically proxies any `/api/...`
  request to the API server (port 3001). No manual CORS configuration needed.
- Completed scan reports and screenshots are saved under `./screenshots/<jobId>/`
  in the repo root so they survive server restarts.
- PDF export uses Playwright's headless Chromium — same binary as the crawler.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `Cannot find Chromium` | Re-run `pnpm --filter @workspace/api-server exec playwright install chromium` |
| Linux: Chromium crashes on launch | Run `pnpm --filter @workspace/api-server exec playwright install-deps chromium` |
| `PORT already in use` | Edit `artifacts/api-server/.env` (change PORT) and `artifacts/qa-inspector/.env` (change PORT and API_URL) |
| Frontend shows blank / 404 | Make sure the API server tab started without errors first |
| PDF export fails on Linux | Install system deps (see Linux note above) then restart the API server |
