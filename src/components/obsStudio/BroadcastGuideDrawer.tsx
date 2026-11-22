import { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  Camera,
  CheckCircle2,
  Cpu,
  Layers,
  Laptop,
  Search,
  Sparkles,
  Tv,
  X,
} from 'lucide-react';

export type GuideLanguageMode = 'mixed' | 'hinglish' | 'english';
export type GuideJumpTarget = 'live' | 'cameras' | 'overlay' | 'connection' | 'map_sources';

interface BroadcastGuideDrawerProps {
  open: boolean;
  onClose: () => void;
  onJumpTo: (target: GuideJumpTarget) => void;
}

interface GuideStep {
  id: string;
  badge: string;
  titleMixed: string;
  titleHinglish: string;
  titleEnglish: string;
  summaryMixed: string;
  summaryHinglish: string;
  summaryEnglish: string;
  bulletsMixed: string[];
  bulletsHinglish: string[];
  bulletsEnglish: string[];
  jumpLabel?: string;
  jumpTarget?: GuideJumpTarget;
  icon: typeof BookOpen;
}

const GUIDE_SECTIONS: GuideStep[] = [
  {
    id: 'program-vs-preview',
    badge: 'CONCEPT 01',
    icon: Tv,
    titleMixed: 'PROGRAM OUTPUT vs CAMERA COMPOSITION (Live aur Preview ka Farq)',
    titleHinglish: 'PROGRAM OUTPUT aur CAMERA COMPOSITION me Farq Samjhein',
    titleEnglish: 'Understanding PROGRAM OUTPUT vs CAMERA COMPOSITION (Preview)',
    summaryMixed:
      'Control Room me left/top panel "PROGRAM OUTPUT" wo real feed dikhata hai jo abhi OBS aur YouTube par LIVE chal rahi hai. Right side "CAMERA COMPOSITION" aapka staging desk hai jahan aap agle cameras aur layout tayyar karte hain.',
    summaryHinglish:
      'PROGRAM OUTPUT wo real screen hai jo abhi OBS se YouTube par ja rahi hai. CAMERA COMPOSITION aapka planning area hai jahan aap next camera ya split-screen set karte hain — jab tak APPLY button nahi dabate, live broadcast disturb nahi hota.',
    summaryEnglish:
      'PROGRAM OUTPUT always reflects what OBS Studio is genuinely broadcasting live right now. CAMERA COMPOSITION is your staging workspace where you select cameras and pick layouts before sending them live.',
    bulletsMixed: [
      'IN PROGRAM badge = Ye camera abhi live YouTube/OBS feed me chal raha hai.',
      'SELECTED badge = Ye camera aapne next composition ke liye chuna hai (abhi live cut nahi hua).',
      'APPLY TO LIVE BROADCAST dabane par hi OBS Studio me naya layout ya camera live hota hai.',
      'Quick Switch Mode (OFF by default): Agar aap single-click me turant camera cut karna chahte hain to hi isse ON karein.',
    ],
    bulletsHinglish: [
      'IN PROGRAM = Camera abhi live chal raha hai.',
      'SELECTED = Camera next layout ke liye ready hai, live abhi change nahi hua.',
      'Jab ready ho jaayein tab "APPLY TO LIVE BROADCAST" dabayein.',
      'Fast single-camera cutting ke liye "Quick Switch" ON kar sakte hain.',
    ],
    bulletsEnglish: [
      'IN PROGRAM means the camera is actively included in the current OBS program scene.',
      'SELECTED means the camera is staged in your next layout without interrupting live viewers.',
      'Click APPLY TO LIVE BROADCAST to apply the staged camera/layout in OBS and confirm the switch.',
      'Enable Quick Switch Mode only if you want single clicks on camera tiles to cut fullscreen live immediately.',
    ],
    jumpLabel: 'Open Live Production Desk',
    jumpTarget: 'live',
  },
  {
    id: 'bridge-obs',
    badge: 'STEP 01',
    icon: Laptop,
    titleMixed: 'Step 1: Windows OBS Bridge & OBS Studio Connect Karein',
    titleHinglish: 'Step 1: OBS Studio aur Windows Bridge Connect Karein',
    titleEnglish: 'Step 1: Connect OBS Studio & Windows Bridge',
    summaryMixed:
      'Sabse pehle apne Windows laptop par OBS Studio 28+ open karein aur Tools -> WebSocket Server Settings enable karein (default port 4455). Phir MaidanLive Windows Bridge app open karke 1-click Pair karein.',
    summaryHinglish:
      'Laptop par OBS open karein -> Tools -> WebSocket Server Settings ON karein (port 4455). Ab MaidanLive Bridge app pair karein — koi router port kholne ki zaroorat nahi.',
    summaryEnglish:
      'Open OBS Studio 28+ on your streaming PC, enable WebSocket Server (Tools -> WebSocket Server Settings, port 4455), then launch and pair the MaidanLive Windows OBS Bridge.',
    bulletsMixed: [
      'Header me "BRIDGE ONLINE" aur "OBS CONNECTED" green dikhna chahiye.',
      'Agar "OBS DISCONNECTED" dikhe to check karein ki OBS khula hai aur WebSocket password sahi hai.',
      'Advanced setup ke liye "OBS Connection & Agent" tab me Direct WS ya CLI Agent options bhi available hain.',
    ],
    bulletsHinglish: [
      'Header me BRIDGE ONLINE aur OBS CONNECTED hona chahiye.',
      'Error aaye to OBS WebSocket password aur port 4455 verify karein.',
      'Direct WebSocket ya manual config JSON bhi OBS Connection tab me mil jaata hai.',
    ],
    bulletsEnglish: [
      'Confirm both BRIDGE ONLINE and OBS CONNECTED appear in the Broadcast Header.',
      'If OBS shows an authentication error, verify the WebSocket password matches OBS -> Tools -> WebSocket Server Settings.',
      'Advanced manual registration and Direct WebSocket settings remain accessible inside OBS Connection & Agent.',
    ],
    jumpLabel: 'Open OBS Connection & Bridge',
    jumpTarget: 'connection',
  },
  {
    id: 'map-sources',
    badge: 'STEP 02',
    icon: Camera,
    titleMixed: 'Step 2: Dynamic OBS Camera Source Mapping + Mobile QR Cameras',
    titleHinglish: 'Step 2: OBS Camera Sources Map Karein ya Mobile Camera Jodein',
    titleEnglish: 'Step 2: Map Dynamic OBS Sources & Connect Mobile Cameras',
    summaryMixed:
      'MaidanLive automatically aapke OBS ke saare inputs/sources (jaise USB Capture Card, Elgato, IP Camera, Browser Source) detect karta hai. "Map OBS Sources" se aap bata sakte hain ki kaunsa OBS input camera hai aur uska naam (CAM 1, WIDE, CLOSE-UP) kya rakhna hai.',
    summaryHinglish:
      'OBS ke saare sources (USB Camera, HDMI Capture, NDI, VDO.Ninja) automatically list ho jaate hain. "Map OBS Sources" khol kar sirf camera sources ko tick karein aur CAM 1, WIDE jaise easy names dein.',
    summaryEnglish:
      'MaidanLive dynamically discovers inputs from OBS Studio (GetInputList). Use Map OBS Sources to mark which OBS inputs are cameras (excluding mics or overlays) and give them clear production names like CAM 1 or WIDE.',
    bulletsMixed: [
      'Microphones (Audio Input) ya MaidanLive Scoreboard ko camera ke roop me tick na karein.',
      'Smartphone se shoot karne ke liye kisi camera tile ka QR icon dabayein aur phone browser me scan karein.',
      'Naya camera add karne ke baad "Refresh OBS Sources" dabane par list turant update hoti hai.',
    ],
    bulletsHinglish: [
      'Mic aur Scoreboard overlay ko camera list me tick na karein.',
      'Phone ko camera banane ke liye Tile par QR icon dabayein aur phone se scan karein.',
      'Naya USB/Capture source jodne par Refresh OBS Sources button dabayein.',
    ],
    bulletsEnglish: [
      'Leave microphones, desktop audio, and overlay browser sources unchecked in the Camera Source Mapper.',
      'For smartphone cameras, click the QR icon on any camera tile and open the link on your field phone.',
      'Whenever you plug in or rename an OBS source, click Refresh OBS Sources to sync.',
    ],
    jumpLabel: 'Open OBS Source Mapper',
    jumpTarget: 'map_sources',
  },
  {
    id: 'multi-cam-pip',
    badge: 'STEP 03',
    icon: Layers,
    titleMixed: 'Step 3: Single, Split, Grid & PIP (Picture-in-Picture) Switching',
    titleHinglish: 'Step 3: Single, Split, Grid aur PIP Layouts Use Karna',
    titleEnglish: 'Step 3: Single, Multi-Camera Splits, Grid & PIP Switching',
    summaryMixed:
      'Multiple cameras dikhane ke liye bas Camera Grid se 2, 3, ya 4+ cameras par click karke select karein, Composition pane me layout (jaise 2-Split, 4-Quad Grid, ya PIP) chunein, aur APPLY TO LIVE BROADCAST button dabayein.',
    summaryHinglish:
      '2 ya zyada cameras ek sath dikhane ke liye camera tiles par click karein -> Split / Grid / PIP chunein -> PIP me Main + Inset Corner & Size set karein -> APPLY TO LIVE BROADCAST dabayein.',
    summaryEnglish:
      'Click multiple camera tiles to stage them together, pick a layout (Single, 2-Split, 3-Split, 4-Grid, PIP, Main+N, or N-Grid), review the 16:9 blueprint, and click APPLY TO LIVE BROADCAST.',
    bulletsMixed: [
      'PIP Mode: Main Camera full screen rehta hai aur Secondary Camera corner chhote box me dikhta hai. Aap Top-Left, Top-Right, Bottom-Left, Bottom-Right aur Small/Medium/Large size set kar sakte hain.',
      'Non-Destructive: Camera switch karte waqt YouTube stream band ya restart nahi hoti, aur user ki apni OBS scenes delete nahi hotin.',
      'Save Preset se aap apna favourite 2-cam ya PIP setup 1-click button ke roop me save kar sakte hain.',
    ],
    bulletsHinglish: [
      'PIP me Main Cam full screen par aur Secondary Cam corner box me chalta hai — corner aur size aap control kar sakte hain.',
      'Scene/Layout change karne par YouTube Live bilkul continuous chalta rehta hai.',
      'Bar-bar use hone wale combos ko Save Preset se save kar lein.',
    ],
    bulletsEnglish: [
      'In PIP mode, choose Main Camera, Secondary (Inset) Camera, Corner Position (4 corners), and Size (Small/Medium/Large).',
      'Switching layouts updates OBS scene items cleanly without deleting user scenes or interrupting YouTube Live.',
      'Use Save Preset to recall frequent multi-camera layouts in one click.',
    ],
    jumpLabel: 'Open Composition Workspace',
    jumpTarget: 'live',
  },
  {
    id: 'scoreboard-youtube',
    badge: 'STEP 04',
    icon: Sparkles,
    titleMixed: 'Step 4: Scoreboard Overlay Top Layer, Sponsors & YouTube Live',
    titleHinglish: 'Step 4: Live Scoreboard Overlay aur YouTube Output Setup',
    titleEnglish: 'Step 4: Scoreboard Overlay Layering, Sponsors & YouTube Output',
    summaryMixed:
      'Har camera switch ya split layout ke baad MaidanLive automatic check karta hai ki "MaidanLive_Scoreboard_Overlay" sabse upar (topmost layer) par rahe, taaki score aur sponsor logos hamesha saaf dikhen.',
    summaryHinglish:
      'Aap chahe Single Cam chalayein ya PIP/Grid, Scoreboard Overlay hamesha top layer par rehta hai. Live score badalte hi OBS me graphics bina refresh kiye update hote hain.',
    summaryEnglish:
      'Whenever you apply a layout, MaidanLive keeps MaidanLive_Scoreboard_Overlay enabled at the highest scene z-index above all cameras, while score updates stream in real time via Socket.IO.',
    bulletsMixed: [
      'Overlay Studio button se full 16:9 scoreboard theme, sponsor tickers aur corner position customize karein.',
      'Scoreboard & Sponsors tab me YouTube Live URL/Video ID link kar sakte hain bina OBS stream roke.',
    ],
    bulletsHinglish: [
      'Overlay Studio se full theme aur sponsor banners customize karein.',
      'Include Live Scoreboard Layer checkbox ON rakhein taaki score har layout par automatic aaye.',
    ],
    bulletsEnglish: [
      'Use Overlay Studio or the Scoreboard & Sponsors tab to adjust theme, overlay mode, position, and active sponsors.',
      'Keep "Include Live Scoreboard Layer" checked when applying layouts to preserve scoreboard visibility on top.',
    ],
    jumpLabel: 'Open Scoreboard & Sponsors',
    jumpTarget: 'overlay',
  },
  {
    id: 'preview-limits',
    badge: 'PRO TIPS',
    icon: Cpu,
    titleMixed: 'Live Preview Performance, Auto-Pause & Troubleshooting',
    titleHinglish: 'Live Preview Kaise Kaam Karta Hai & Troubleshooting Guide',
    titleEnglish: 'Live Preview Architecture, Limitations & Troubleshooting',
    summaryMixed:
      'OBS Studio laptop par local 60fps preview dikhata hai, lekin browser Control Room me bandwidth aur CPU bachane ke liye MaidanLive do efficient modes use karta hai: (1) Smart OBS Snapshots (compact 640×360 JPEG every 1s–5s), aur (2) Smartphone cams ke liye Live WebRTC.',
    summaryHinglish:
      'Browser ko hang hone se bachane ke liye OBS Snapshots compact JPEG frames (1s–5s) par chalte hain aur tab minimize karne par automatically pause ho jaate hain. Phone cameras ke liye Live WebRTC mode instant smooth video dikhata hai.',
    summaryEnglish:
      'To keep your broadcast PC fast and avoid saturating upload bandwidth, OBS previews use rate-limited compact JPEG snapshots (640x360) synced via a concurrency queue, and automatically pause whenever the browser tab is hidden.',
    bulletsMixed: [
      'Limitation: OBS Snapshots local OBS preview ki tarah 60fps raw video stream nahi karte (1–3 sec interval par updated live frames dikhate hain); mobile VDO.Ninja cams "Live WebRTC" mode me full motion chalti hain.',
      'Agar kisi tile me "Preview unavailable" dikhe to check karein ki OBS Source ka naam exact match hai aur wo OBS me active/initialized hai.',
      'OBS Scene mismatch ya lag aane par header me "Sync OBS" dabakar fresh snapshot lein.',
    ],
    bulletsHinglish: [
      'Note: OBS Snapshots bandwidth bachane ke liye har 1–3s me frame update karte hain (60fps OBS window ki tarah raw video nahi).',
      'Tab switch karne par polling auto-pause hoti hai taaki match stream smooth rahe.',
      'Source preview na aaye to Camera Source Mapper me exact OBS source name check karein.',
    ],
    bulletsEnglish: [
      'Known limitation: OBS source snapshots update at the selected polling interval (1s–5s) rather than streaming full 60fps raw video through the backend. Use Live WebRTC for VDO.Ninja smartphone monitors.',
      'Polling automatically pauses when the browser tab is inactive to protect streaming CPU and upload bandwidth.',
      'If a tile reports preview unavailable, verify the mapped OBS input name exists in OBS Studio and is active.',
    ],
  },
];

export function BroadcastGuideDrawer({
  open,
  onClose,
  onJumpTo,
}: BroadcastGuideDrawerProps) {
  const [language, setLanguage] = useState<GuideLanguageMode>('mixed');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const filteredSections = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return GUIDE_SECTIONS;
    return GUIDE_SECTIONS.filter((sec) => {
      const hay = [
        sec.badge,
        sec.titleMixed,
        sec.titleHinglish,
        sec.titleEnglish,
        sec.summaryMixed,
        sec.summaryHinglish,
        sec.summaryEnglish,
        ...sec.bulletsMixed,
        ...sec.bulletsHinglish,
        ...sec.bulletsEnglish,
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [search]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-950/70 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label="Broadcast Control Room Usage Guide"
      onClick={onClose}
    >
      <aside
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl h-full bg-slate-950 text-slate-100 border-l border-slate-800 shadow-2xl flex flex-col"
      >
        {/* Drawer Header */}
        <div className="px-5 py-4 border-b border-slate-800 bg-slate-900/95 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-[#EA580C]/20 border border-[#EA580C]/40 text-[#EA580C]">
                <BookOpen className="w-4 h-4" />
              </span>
              <h2 className="font-display text-base font-bold text-white tracking-wide">
                Broadcast Control Room Guide
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Step-by-step live production handbook — Hinglish + English
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Broadcast Guide"
            className="min-h-[34px] min-w-[34px] inline-flex items-center justify-center rounded-lg border border-slate-700 bg-slate-900 text-slate-300 hover:text-white hover:bg-slate-800 shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Language Toggle & Search */}
        <div className="px-5 py-3 border-b border-slate-800 bg-slate-900/60 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Guide Language
            </span>
            <div className="inline-flex items-center p-0.5 rounded-lg bg-slate-950 border border-slate-800">
              {(
                [
                  { id: 'mixed', label: 'Hinglish + English' },
                  { id: 'hinglish', label: 'Hinglish' },
                  { id: 'english', label: 'English' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setLanguage(opt.id)}
                  className={`min-h-[28px] px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors whitespace-nowrap ${
                    language === opt.id
                      ? 'bg-[#EA580C] text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search PIP, Bridge, OBS source, QR, preview..."
              className="w-full min-h-[36px] pl-9 pr-3 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:border-[#EA580C]"
            />
          </div>
        </div>

        {/* Scrollable Chapters */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {filteredSections.length === 0 ? (
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 text-center text-xs text-slate-400">
              No matching guide steps found for &ldquo;{search}&rdquo;. Clear search to view all steps.
            </div>
          ) : (
            filteredSections.map((sec) => {
              const Icon = sec.icon;
              const title =
                language === 'hinglish'
                  ? sec.titleHinglish
                  : language === 'english'
                    ? sec.titleEnglish
                    : sec.titleMixed;
              const summary =
                language === 'hinglish'
                  ? sec.summaryHinglish
                  : language === 'english'
                    ? sec.summaryEnglish
                    : sec.summaryMixed;
              const bullets =
                language === 'hinglish'
                  ? sec.bulletsHinglish
                  : language === 'english'
                    ? sec.bulletsEnglish
                    : sec.bulletsMixed;

              return (
                <article
                  key={sec.id}
                  className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <span className="mt-0.5 w-7 h-7 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-center text-[#EA580C] shrink-0">
                        <Icon className="w-3.5 h-3.5" />
                      </span>
                      <div className="min-w-0">
                        <span className="inline-block font-mono text-[10px] font-bold tracking-wider uppercase text-orange-400">
                          {sec.badge}
                        </span>
                        <h3 className="text-sm font-bold text-white leading-snug mt-0.5">
                          {title}
                        </h3>
                      </div>
                    </div>
                  </div>

                  <p className="text-xs text-slate-300 leading-relaxed">{summary}</p>

                  <ul className="space-y-1.5">
                    {bullets.map((b, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-xs text-slate-300">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                        <span className="leading-relaxed">{b}</span>
                      </li>
                    ))}
                  </ul>

                  {sec.jumpTarget && sec.jumpLabel && (
                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          onJumpTo(sec.jumpTarget!);
                          onClose();
                        }}
                        className="min-h-[32px] inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-950 border border-slate-700 text-[11px] font-semibold text-orange-300 hover:border-[#EA580C] hover:text-white transition-colors"
                      >
                        <span>{sec.jumpLabel} →</span>
                      </button>
                    </div>
                  )}
                </article>
              );
            })
          )}
        </div>
      </aside>
    </div>
  );
}
