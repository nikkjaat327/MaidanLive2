# MaidanLive MediaMTX Setup & Live Streaming Guide

This guide covers deploying **MediaMTX** alongside **MaidanLive** for low-latency custom RTMP/LL-HLS/WebRTC broadcasting, testing locally on Windows with OBS Studio / Larix Broadcaster / VLC, and optimizing bitrates for rural and semi-urban Indian 4G/LTE ground networks.

---

## 1. Architecture Overview

1. **Field Camera / OBS / Larix** pushes RTMP video to MediaMTX (`rtmp://<host>:1935/<mediamtxStreamPath>?key=<mediamtxStreamKey>`).
2. **MediaMTX Auth Webhook** calls `POST /api/v1/mediamtx/auth` on MaidanLive to verify that `path` matches `mediamtxStreamPath` and `key` matches the private `mediamtxStreamKey`.
3. **MediaMTX Output** exposes:
   - **WebRTC (WHEP)** on `:8889` (`<webrtcBase>/<path>/whep`) for sub-second latency.
   - **LL-HLS** on `:8888` (`<hlsBase>/<path>/index.m3u8`) for universal Safari/Android/Chrome compatibility.
   - **Control API** on `127.0.0.1:9997` (`MEDIAMTX_API_URL`) so MaidanLive can verify whether an encoder is actively publishing **before** allowing a mid-match switch from YouTube to MediaMTX.
4. **Security**: `mediamtxStreamKey` is never returned in public endpoints (`GET /api/live` or `GET /api/live/:id`). Only authorized Admins (`matches:manage_stream`) can inspect or regenerate RTMP keys in the Admin Portal.

---

## 2. Production Ubuntu VPS Deployment (Docker + Nginx)

### Firewall Ports
Open the following ports on UFW / Cloud Firewall:
- `80/tcp`, `443/tcp` — HTTPS web app, Socket.IO, HLS (`/hls/`), WebRTC WHEP (`/webrtc/`)
- `1935/tcp` — RTMP encoder ingest from grounds
- `8189/udp`, `8189/tcp` — WebRTC ICE/RTP media transport

> Keep port `9997` (MediaMTX Control API) and `3000` (Node app) bound to `127.0.0.1` / Docker internal network only.

### Step-by-Step Setup

1. Clone repository & configure `.env`:
   ```bash
   cp .env.example .env
   ```
   Set production values in `.env`:
   ```env
   JWT_SECRET=<strong-64-char-random-secret>
   MEDIAMTX_RTMP_URL=rtmp://stream.example.in:1935
   MEDIAMTX_HLS_URL=https://stream.example.in/hls
   MEDIAMTX_WEBRTC_URL=https://stream.example.in/webrtc
   MEDIAMTX_API_URL=http://mediamtx:9997
   ```
   *(Leave `MONGODB_URI` empty to run on the built-in SQLite engine `/data/maidanlive.db`, or set `MONGODB_URI` / start with `--profile mongo`.)*

2. Ensure MediaMTX WebRTC ICE host IP/domain is reachable (`deploy/mediamtx/mediamtx.yml`):
   ```yaml
   webrtcAdditionalHosts: [stream.example.in]
   ```

3. Start MediaMTX + MaidanLive:
   ```bash
   cd deploy/mediamtx
   docker compose up -d
   # Or with MongoDB included:
   docker compose --profile mongo up -d
   ```

4. Install Nginx TLS config:
   ```bash
   sudo cp deploy/mediamtx/nginx.conf /etc/nginx/sites-available/maidanlive.conf
   sudo ln -s /etc/nginx/sites-available/maidanlive.conf /etc/nginx/sites-enabled/
   sudo nginx -t && sudo systemctl reload nginx
   ```

---

## 3. Windows Local Testing Guide (OBS + Larix + VLC)

### Step A: Start MediaMTX on Windows
1. Download the latest Windows release (`mediamtx_v1.x_windows_amd64.zip`) from the MediaMTX releases page.
2. Copy `/deploy/mediamtx/mediamtx.yml` beside `mediamtx.exe` and change `authHTTPAddress` for local Windows testing:
   ```yaml
   authHTTPAddress: http://127.0.0.1:3000/api/v1/mediamtx/auth
   ```
3. Double-click `mediamtx.exe` (or run `.\mediamtx.exe` in PowerShell).
4. Start MaidanLive (`npm run dev` or production `node server.ts`) with:
   ```env
   MEDIAMTX_RTMP_URL=rtmp://localhost:1935
   MEDIAMTX_HLS_URL=http://localhost:8888
   MEDIAMTX_WEBRTC_URL=http://localhost:8889
   MEDIAMTX_API_URL=http://127.0.0.1:9997
   ```

### Step B: Retrieve Private RTMP Credentials in Admin Portal
1. Sign in to **Admin Portal -> Live Streams**.
2. Create a match stream (either **YouTube** or **MediaMTX** as initial provider).
3. Click **RTMP / Health** on the match row to inspect:
   - **RTMP Ingest Server**: `rtmp://localhost:1935`
   - **Stream Key Path**: e.g. `live/kabaddi-final?key=<secret>`

### Step C: Configure OBS Studio (Desktop / Laptop)
1. Open **OBS Studio -> Settings -> Stream**:
   - **Service**: `Custom...`
   - **Server**: `rtmp://localhost:1935/live` *(or `rtmp://localhost:1935` if putting `live/slug?key=...` in Stream Key)*
   - **Stream Key**: `<slug>?key=<mediamtxStreamKey>` *(paste the exact Path/Key shown in MaidanLive)*
2. Open **Settings -> Output -> Streaming**:
   - **Rate Control**: `CBR`
   - **Video Bitrate**: `2000 Kbps`
   - **Keyframe Interval**: `2 s` *(mandatory for clean HLS/WebRTC switching)*
   - **Tune**: `zerolatency` (x264)
3. Click **Start Streaming**.

### Step D: Mobile Field Testing (Larix Broadcaster on Android / iOS)
1. Install **Larix Broadcaster** on the ground phone.
2. Add Connection -> URL:
   `rtmp://<LAN-IP-or-Domain>:1935/<mediamtxStreamPath>?key=<mediamtxStreamKey>`
3. Video settings: `720p @ 30fps`, `1500–2000 kbps`, `2s` keyframe interval, `AAC 96 kbps` audio.

### Step E: Verify in VLC & Test Mid-Match Failover
1. Verify raw MediaMTX HLS playback in VLC: **Media -> Open Network Stream ->** `http://localhost:8888/<mediamtxStreamPath>/index.m3u8`.
2. In MaidanLive **Admin Portal -> Live Streams**:
   - Click **RTMP / Health** -> **Check Stream Health** (verifies MediaMTX Control API sees `PUBLISHING`).
   - Click **Switch Feed** -> switch between **YouTube Live** and **MediaMTX** live during an active match.
   - All connected viewers automatically transition without reloading the match page or losing scoreboard/chat state.
   - Attempting to switch to an offline destination returns **422** and safely preserves the active live feed.

---

## 4. Field Network & VPS Sizing Recommendations (India Grassroots)

| Network Condition | Resolution & FPS | Video Bitrate (CBR) | Audio | Keyframe |
|---|---|---|---|---|
| Weak rural 4G / crowded ground | `480p` (`854x480`) @ 25–30 fps | `900 – 1200 Kbps` | `64 kbps` AAC | `2s` |
| Standard Jio / Airtel 4G | `720p` (`1280x720`) @ 30 fps | `1800 – 2200 Kbps` | `96 kbps` AAC | `2s` |
| Stadium Fiber / 5G uplink | `1080p` (`1920x1080`) @ 30 fps | `3500 – 4500 Kbps` | `128 kbps` AAC | `2s` |

- **Entry VPS (1–3 concurrent streams, ~500 concurrent HLS/WebRTC viewers)**:
  2 vCPU, 4 GB RAM, Ubuntu 24.04 LTS, 1 Gbps unmetered/high-bandwidth port (Mumbai/Bengaluru region recommended for <40 ms ground-to-server RTT).
- **Failover Tip**: Keep a YouTube unlisted backup stream configured on the match so if MediaMTX loses local encoder uplink, an admin can switch viewers back to YouTube in one click after validating health.
