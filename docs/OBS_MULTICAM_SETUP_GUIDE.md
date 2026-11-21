# MaidanLive Multi-Camera OBS Studio & YouTube Live Setup Guide

## Architecture Overview

MaidanLive routes all field smartphone and studio cameras into **OBS Studio** so that camera switches, split-screen views, and live scoreboard overlays happen inside OBS—sending **one continuous output stream** to **YouTube Live** (and the MaidanLive match viewer page) without ever restarting or interrupting the broadcast.

```
Multiple Smartphones (2, 3, 4, 6, 8+ via VDO.Ninja / RTMP)
  ↓
OBS Studio (Browser Sources / MediaMTX / Capture Cards)
  ↑  (Controlled via Local OBS Agent or Direct WebSocket v5)
MaidanLive Multi-Cam Broadcast Studio (/admin/broadcast-studio/:matchId)
  ↓
Single Continuous 1920×1080 Output Stream
  ↓
YouTube Live → MaidanLive Live Match Page (/live/:id)
```

---

## 1. Enable OBS WebSocket v5 in OBS Studio

1. Install **OBS Studio 28+** (WebSocket v5 is built in; no extra plugin needed).
2. Open OBS Studio → **Tools → WebSocket Server Settings**.
3. Check **Enable WebSocket server**.
4. Keep **Server Port** as `4455`.
5. Check **Enable Authentication**, click **Generate Password** (or set a strong password), and save.
6. Set OBS Canvas & Output Resolution (**Settings → Video**) to **1920×1080** (16:9).

---

## 2. Connect OBS Studio to MaidanLive

Choose either connection mode in **OBS Connection & Agent** inside `/admin/broadcast-studio/:matchId`:

### Option A: Local OBS Controller Agent (Recommended for Cloud-Hosted MaidanLive & Stadium Laptops)
When your OBS laptop is behind a router/4G hotspot/NAT, the MaidanLive server cannot dial `127.0.0.1:4455` directly. The Local Agent connects **outbound** over Socket.IO to MaidanLive:

1. In MaidanLive **OBS Connection & Agent**, click **Generate Local Agent Token**.
2. Copy the generated command and run it on the OBS laptop (requires Node.js 18+):
   ```bash
   cd deploy/obs-agent
   npm install
   node maidanlive-obs-agent.mjs \
     --server https://YOUR_MAIDANLIVE_URL \
     --match YOUR_MATCH_ID \
     --token YOUR_GENERATED_AGENT_TOKEN \
     --obs-url ws://127.0.0.1:4455 \
     --obs-password YOUR_OBS_WS_PASSWORD
   ```
3. You will see **AGENT ONLINE** and **OBS CONNECTED** in MaidanLive immediately.

### Option B: Direct OBS WebSocket v5 (LAN / Self-Hosted Server)
If MaidanLive runs on the same machine or LAN as OBS Studio (or via secure `wss://` tunnel):
1. Select **Direct OBS WebSocket v5**.
2. Enter `ws` (or `wss`), Host (`127.0.0.1` or LAN IP), Port (`4455`), and OBS WebSocket Password.
3. Click **Test Connection**, then **Connect OBS Studio**.

---

## 3. Connect 2, 4, 6, 8+ Smartphones (VDO.Ninja)

1. Open the **Cameras & Smartphones** tab and add any number of cameras (individual or **+ Add 2 / 4 / 6 Mobile Cams**).
2. Click **Setup QR** next to any camera to open the **Smartphone Setup Wizard**.
3. Scan the QR code with the field smartphone's browser (Chrome / Safari) and tap **Start Camera Feed & Heartbeat**.
   - Each phone uses a camera-scoped link (`/camera-connect/:cameraDocId?token=...`)—no Admin login is needed on phones!
4. When you click **Take Live** or **Apply Layout Live in OBS** in MaidanLive, MaidanLive automatically creates/updates the corresponding Browser Sources (`ML_CAM_1`, `ML_CAM_2`, ...) and scenes inside OBS Studio with 1920×1080 coordinates.

---

## 4. Continuous YouTube Live Output & Scoreboard Layer

1. In OBS Studio, add your **YouTube Live Stream Key** under **Settings → Stream → YouTube - RTMPS**.
2. Start **Start Streaming** once in OBS Studio before the match begins.
3. MaidanLive also automatically includes your live transparent Scoreboard Browser Source (`/broadcast/overlay/view/:matchId?obs=1&controls=0`) as the top layer in generated layouts so runs, wickets, overs, and chase targets stay visible across every camera cut and split screen.
4. Switching between Camera 1, Camera 2, Split 2, Grid 4, or Dynamic N-Camera Grids never drops or restarts the YouTube Live ingest.

---

## 5. Ground & Rural 4G Optimization Checklist

- **Network**: Enable **Low-Bandwidth Ground Mode** on cameras over 4G (`854×480 @ 24–30fps`, `800–1200 kbps`) to keep latency low without stalling OBS.
- **Orientation**: Lock all field phones to **Landscape** before tapping Start.
- **Heat & Power**: Keep phones shaded, lower screen brightness, and attach a USB-C power bank during full T20 or tournament days.
- **Admin Override**: During critical overs or finals, engage **Admin Override** from the studio header to lock OBS scene switching exclusively to Admins/Super Admins.
