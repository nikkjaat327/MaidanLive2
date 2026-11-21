# MaidanLive Windows Local OBS Bridge (`deploy/obs-agent`)

Lightweight Node.js bridge that runs locally on your **Windows broadcast laptop** alongside **OBS Studio 28+**.  
It lets your remotely hosted MaidanLive Control Room switch OBS scenes, toggle sources, and apply multi-camera layouts **without opening router port 4455 or exposing OBS WebSocket publicly**.

---

## Architecture

```
MaidanLive Frontend (Control Room)
   ↕ HTTPS + Socket.IO
MaidanLive Backend (/obs-agent namespace)
   ↕ Authenticated Outbound Socket.IO (Bridge ID + Token)
Windows Local OBS Bridge (this folder)
   ↕ localhost ONLY (ws://127.0.0.1:4455)
OBS Studio 28+ (WebSocket Server v5, password protected)
   ↓ Single continuous RTMPS stream
YouTube Live → MaidanLive Viewer Page
```

---

## Step 1: Configure OBS Studio on Windows

1. Install **OBS Studio 28+** (includes built-in OBS WebSocket v5).
2. Open **OBS Studio → Tools → WebSocket Server Settings**.
3. Check **Enable WebSocket server**.
4. Keep **Server Port** set to `4455`.
5. Check **Enable Authentication** and set (or generate) a strong WebSocket password. Click **Apply / OK**.
6. Configure **Settings → Stream → YouTube - RTMPS** with your YouTube Live Stream Key.
7. Set **Settings → Video** Base & Output resolution to `1920×1080`.

---

## Step 2: Register Your Bridge in MaidanLive

1. Log in to MaidanLive as **Admin** or assigned **Broadcaster** and open **Broadcast Studio** for your match.
2. Open the **OBS Connection & Agent** tab.
3. Click **Register Windows Bridge**, enter a name (e.g. `Ground Laptop 1`), and assign it to your match.
4. Click **Download config.json** (or copy the generated Bridge ID & Bridge Token shown once).

---

## Step 3: Run the Bridge on Windows

1. Install **Node.js 18+ LTS** on your Windows laptop (`https://nodejs.org/`).
2. Copy the `deploy/obs-agent` folder onto your Windows laptop (e.g. `C:\MaidanLive-OBS-Bridge\`).
3. Place your downloaded `config.json` inside that folder and set `"obsPassword"` to match OBS WebSocket password.
   *(Or skip copying `config.json` manually and double-click `start-windows-bridge.bat` to enter credentials in the wizard!)*
4. Double-click **`start-windows-bridge.bat`**.

You should see in the terminal:
```
[MaidanLive Bridge] Authenticated outbound bridge to https://.../obs-agent (Bridge ML-BRG-XXXXXX)
[MaidanLive Bridge] Connected to local OBS Studio WebSocket v5 (ws://127.0.0.1:4455)
[MaidanLive Bridge] Discovered 4 OBS scenes. Active program scene: "CAM 1"
```

And in MaidanLive Control Room:
- **BRIDGE ONLINE**
- **OBS CONNECTED**
- Live OBS Studio Scenes populated dynamically with your exact OBS scenes!

---

## Step 4 (Optional): Auto-Start with Windows

Once `config.json` is tested and working, double-click **`install-windows-startup.bat`** to add a shortcut to your Windows Startup folder.

---

## Security Guarantees

- **Localhost-Only OBS**: OBS WebSocket stays bound to `127.0.0.1:4455` and is never exposed to the public internet.
- **Credential Isolation**: Your `obsPassword` and `bridgeToken` stay only in `config.json` on your Windows PC and are never sent to the MaidanLive frontend or printed in logs.
- **Strict Command Allowlist**: The bridge only executes approved OBS WebSocket v5 actions (`GetSceneList`, `SetCurrentProgramScene`, `GetCurrentProgramScene`, `GetSceneItemList`, `SetSceneItemEnabled`, stream/record controls, and audio mute). Zero shell or OS command execution exists.
- **Instant Revocation**: If a laptop is lost or compromised, click **Revoke** in MaidanLive to immediately disconnect and block that Bridge ID.
