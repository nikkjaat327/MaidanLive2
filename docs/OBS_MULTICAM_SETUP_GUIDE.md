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

Choose either connection mode in **OBS Connection & Agent** inside `/admin/broadcast-studio/:matchId` (or `/broadcaster/control-room/:matchId`):

### Option A: One-Click Windows OBS Bridge Desktop App (Recommended)
When your OBS laptop runs behind a router, 4G hotspot, or NAT, MaidanLive never connects directly to `localhost:4455` and you never need router port forwarding, Node.js, npm, Git, or JSON editing:

1. Open **OBS Connection & Agent** in MaidanLive (`/admin/broadcast-studio/:matchId` or `/broadcaster/control-room/:matchId`).
2. Click **Download Windows Bridge** to download `MaidanLive OBS Bridge Setup.exe`.
3. Double-click the installer — it installs cleanly as a per-user Windows app (zero terminal steps) and registers `maidanlive-bridge://` one-click pairing.
4. Click **Open / Pair Bridge** inside MaidanLive (or enter the 8-character single-use Pairing Code / sign in with your Broadcaster account inside the desktop app).
5. Enter your OBS WebSocket v5 password (`Tools → WebSocket Server Settings → port 4455`) once in the app — it is encrypted locally using Windows DPAPI (`safeStorage`) and never transmitted to MaidanLive.
6. You will immediately see **BRIDGE ONLINE**, **OBS CONNECTED**, and your dynamic OBS scene list inside the Control Room. Minimize the app to your Windows System Tray; it reconnects automatically across brief internet or OBS restarts.

### Option B: Direct OBS WebSocket v5 (Same-Machine / LAN Only)
If MaidanLive backend runs on the exact same machine or trusted LAN as OBS Studio (or via secure `wss://` tunnel):
1. Expand **Advanced: Manual Registration & Direct WS** in **OBS Connection & Agent** and select **Direct OBS WebSocket v5**.
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
2. Click **Start Streaming** once in OBS Studio before the match begins.
3. MaidanLive also automatically includes your live transparent Scoreboard Browser Source (`/broadcast/overlay/view/:matchId?obs=1&controls=0`) as the top layer in generated layouts so runs, wickets, overs, and chase targets stay visible across every camera cut and split screen.
4. Switching between Camera 1, Camera 2, Split 2, Grid 4, custom OBS scenes, or Dynamic N-Camera Grids issues `SetCurrentProgramScene` inside OBS and **never** stops or restarts the YouTube Live ingest.

---

## 5. Ground & Rural 4G Optimization Checklist

- **Network**: Enable **Low-Bandwidth Ground Mode** on cameras over 4G (`854×480 @ 24–30fps`, `800–1200 kbps`) to keep latency low without stalling OBS.
- **Orientation**: Lock all field phones to **Landscape** before tapping Start.
- **Heat & Power**: Keep phones shaded, lower screen brightness, and attach a USB-C power bank during full T20 or tournament days.
- **Broadcaster Role**: Assign Broadcasters per tournament or match in `/admin/broadcasters`; broadcasters manage switching & audio inside `/broadcaster/control-room/:matchId`.
- **Show Monitor (Admin Streams Page)**: Whenever a stream is **LIVE**, Admins can click **Show Monitor** next to **Score Control** in **Admin → Live Streams** to preview the live broadcast video.
- **Admin Override**: During critical overs or finals, engage **Admin Override** from the studio header to lock OBS scene switching exclusively to Admins/Super Admins.

---

## 6. Windows Desktop App & Legacy CLI Quick Reference

### Recommended: Windows Desktop Installer (`MaidanLive OBS Bridge Setup.exe`)
- **Zero prerequisites**: Bundles Node.js, `obs-websocket-js`, and `socket.io-client` inside the installer.
- **System Tray**: Closing the window minimizes it to the Windows System Tray with **Open**, **Reconnect Local OBS**, **Reconnect MaidanLive**, and **Quit**.
- **Optional Startup Launch**: Toggle **"Launch MaidanLive OBS Bridge automatically when Windows starts"** inside the app.
- **Security**: Permanent bridge credentials and `obsPassword` are encrypted via Windows DPAPI; pairing codes expire in 5 minutes and work only once; browser links never carry permanent bridge secrets.

### Advanced / Legacy CLI (`deploy/obs-agent`)
1. Expand **Advanced: Manual Registration & Direct WS** -> **Register Windows Bridge** to generate a manual `config.json`.
2. Copy `deploy/obs-agent` onto a machine with Node.js 18+, run `npm install`, add your `obsPassword`, and launch `start-windows-bridge.bat`.
3. **Security Reminder**: Never expose OBS WebSocket port `4455` publicly on your router or store `obsPassword` in MaidanLive frontend/cloud logs. If a laptop is lost or rotated, click **Revoke** or **Rotate Token** inside **OBS Connection & Agent** to cut off that bridge immediately.

---

## 7. Verification & Testing Checklist

1. **OBS WebSocket Auth (`127.0.0.1:4455`)**: Start OBS Studio 28+ with WebSocket v5 enabled on `127.0.0.1:4455` + authentication enabled and verify bridge connection succeeds.
2. **Wrong OBS Password Handling**: Temporarily configure a wrong `obsPassword` in `config.json` — verify the bridge logs an auth failure (`4009`) clearly without leaking secrets and MaidanLive surfaces `OBS ERROR`.
3. **Registered Bridge Lifecycle**: Register a Windows bridge (`ML-BRG-...`), download `config.json`, verify initial `BRIDGE OFFLINE` -> `BRIDGE ONLINE`, and verify attaching/detaching the bridge to a match.
4. **Dynamic Scene Discovery & Refresh**: Add or rename a scene in OBS Studio, click **Refresh Scenes** in Tab 1 (`OBS Scene Switcher`), and confirm the exact OBS scene list updates via `SCENE_LIST_UPDATED`.
5. **Remote Scene Switching**: Click any OBS scene button in MaidanLive — verify `SCENE_SWITCH_REQUESTED` -> `SetCurrentProgramScene` -> `GetCurrentProgramScene` -> `SCENE_SWITCH_SUCCESS` & `CURRENT_SCENE_CHANGED` updates the `LIVE` badge across open Control Room tabs.
6. **Continuous YouTube Live Stream**: While streaming live to YouTube from OBS, switch between 3+ OBS scenes rapidly and confirm YouTube Live broadcast uptime remains continuous without restarting or dropping ingest.
7. **Active Scene Source Visibility**: Toggle Active Scene Sources (`Visible` / `Hidden`) in Tab 1 and confirm OBS scene items update cleanly.
8. **Custom Scene Display Labels**: Rename friendly labels via **Rename Labels** and confirm buttons keep targeting the underlying OBS scene names.
9. **OBS Offline & Recovery**: Close OBS Studio while the bridge runs — confirm MaidanLive reports `OBS DISCONNECTED`, then reopen OBS and confirm automatic reconnection & `OBS CONNECTED` recovery.
10. **Backend Disconnect & Reconnect**: Restart the backend or simulate brief network drop — confirm the Windows bridge buffers safely and auto-reconnects without manual intervention.
11. **Multi-Match Bridge Assignment**: Attach one registered bridge to another match and confirm scenes & switch commands route to the newly active match cleanly.
12. **Token Rotation**: Click **Rotate Token** on a bridge — verify old credentials fail handshake and new credentials connect immediately.
13. **Bridge Revocation**: Click **Revoke** on an active bridge — confirm the connected bridge receives `server:bridge_revoked`, disconnects immediately, stops reconnect loops, and is blocked on any new handshake until reactivated.
14. **RBAC Isolation**: Verify spectators, logged-out players, and unauthorized broadcasters cannot view bridge lists, receive studio events, or trigger scene switches (`401`/`403`).
15. **Command Allowlist**: Confirm the bridge rejects any non-allowlisted command (`APPROVED_COMMANDS`) and contains zero shell/OS execution capability.
16. **Admin Show Monitor Guardrail**: In **Admin → Live Streams**, confirm **Show Monitor** appears strictly before **Score Control** only on `LIVE` streams and opens the live video preview cleanly.


