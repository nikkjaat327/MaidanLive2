import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  BatteryCharging,
  Camera,
  Check,
  Copy,
  ExternalLink,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Wifi,
} from 'lucide-react';
import { Modal } from '../common/Modal.tsx';
import type {
  BroadcastCameraData,
  CameraOrientationMode,
  CameraPreviewFit,
  CameraSourceType,
  CameraType,
} from '../../types/obs.ts';

interface CameraFormModalProps {
  open: boolean;
  onClose: () => void;
  editingCamera: BroadcastCameraData | null;
  operators: Array<{ id: string; name: string; email: string; role: string }>;
  vdoRoomName: string;
  onSave: (payload: Partial<BroadcastCameraData> & { expiresInHours?: number }) => Promise<void>;
}

export function CameraFormModal({
  open,
  onClose,
  editingCamera,
  operators,
  vdoRoomName,
  onSave,
}: CameraFormModalProps) {
  const [name, setName] = useState('');
  const [label, setLabel] = useState('');
  const [cameraNumber, setCameraNumber] = useState('1');
  const [position, setPosition] = useState('');
  const [cameraType, setCameraType] = useState<CameraType>('smartphone_vdo');
  const [sourceType, setSourceType] = useState<CameraSourceType>('vdoninja');
  const [connectionUrl, setConnectionUrl] = useState('');
  const [resolution, setResolution] = useState<BroadcastCameraData['resolution']>('1280x720');
  const [fps, setFps] = useState('30');
  const [bitrateKbps, setBitrateKbps] = useState('2000');
  const [lowBandwidthMode, setLowBandwidthMode] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [orientationMode, setOrientationMode] = useState<CameraOrientationMode>('auto');
  const [previewFit, setPreviewFit] = useState<CameraPreviewFit>('contain');
  const [portraitBackdropFill, setPortraitBackdropFill] = useState(true);
  const [obsSceneName, setObsSceneName] = useState('');
  const [obsInputName, setObsInputName] = useState('');
  const [operatorUserId, setOperatorUserId] = useState('');
  const [operatorName, setOperatorName] = useState('');
  const [priority, setPriority] = useState('10');
  const [description, setDescription] = useState('');
  const [expiresInHours, setExpiresInHours] = useState('12');
  const [isDefault, setIsDefault] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editingCamera) {
      setName(editingCamera.name || '');
      setLabel(editingCamera.label || '');
      setCameraNumber(String(editingCamera.cameraNumber || 1));
      setPosition(editingCamera.position || '');
      setCameraType(editingCamera.cameraType || 'smartphone_vdo');
      setSourceType(editingCamera.sourceType || 'vdoninja');
      setConnectionUrl(editingCamera.connectionUrl || '');
      setResolution(editingCamera.resolution || '1280x720');
      setFps(String(editingCamera.fps || 30));
      setBitrateKbps(String(editingCamera.bitrateKbps || 2000));
      setLowBandwidthMode(Boolean(editingCamera.lowBandwidthMode));
      setFacingMode(editingCamera.facingMode || 'environment');
      setOrientationMode(editingCamera.orientationMode || 'auto');
      setPreviewFit(editingCamera.previewFit || 'contain');
      setPortraitBackdropFill(editingCamera.portraitBackdropFill !== false);
      setObsSceneName(editingCamera.obsSceneName || '');
      setObsInputName(editingCamera.obsInputName || '');
      setOperatorUserId(editingCamera.operatorUserId || '');
      setOperatorName(editingCamera.operatorName || '');
      setPriority(String(editingCamera.priority || 10));
      setDescription(editingCamera.description || '');
      setIsDefault(Boolean(editingCamera.isDefault));
      setEnabled(editingCamera.enabled !== false);
    } else {
      setName('');
      setLabel('Main Ground Camera');
      setCameraNumber('');
      setPosition('Center Ground');
      setCameraType('smartphone_vdo');
      setSourceType('vdoninja');
      setConnectionUrl('');
      setResolution('1280x720');
      setFps('30');
      setBitrateKbps('2000');
      setLowBandwidthMode(false);
      setFacingMode('environment');
      setOrientationMode('auto');
      setPreviewFit('contain');
      setPortraitBackdropFill(true);
      setObsSceneName('');
      setObsInputName('');
      setOperatorUserId('');
      setOperatorName('');
      setPriority('10');
      setDescription('');
      setIsDefault(false);
      setEnabled(true);
    }
  }, [open, editingCamera]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      setSaving(true);
      await onSave({
        ...(name.trim() ? { name: name.trim() } : {}),
        label: label.trim() || 'Ground Camera',
        ...(cameraNumber ? { cameraNumber: Number(cameraNumber) } : {}),
        position: position.trim(),
        cameraType,
        sourceType,
        connectionUrl: connectionUrl.trim(),
        vdoRoomName,
        resolution,
        fps: Number(fps) || 30,
        bitrateKbps: Number(bitrateKbps) || 2000,
        lowBandwidthMode,
        facingMode,
        orientationMode,
        previewFit,
        portraitBackdropFill,
        obsSceneName: obsSceneName.trim(),
        obsInputName: obsInputName.trim(),
        operatorUserId: operatorUserId || null,
        operatorName: operatorName.trim(),
        priority: Number(priority) || 10,
        description: description.trim(),
        isDefault,
        enabled,
        ...(!editingCamera ? { expiresInHours: Number(expiresInHours) || 12 } : {}),
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editingCamera ? `Edit ${editingCamera.name}` : 'Add Dynamic Broadcast Camera'}
      subtitle="Add unlimited smartphone, RTMP/MediaMTX, USB capture, or custom OBS cameras."
      maxWidthClass="max-w-2xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Camera Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Camera 1 (auto if blank)"
              className="w-full min-h-[40px] px-3 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Angle Label *</label>
            <input
              type="text"
              required
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Bowler End / Boundary"
              className="w-full min-h-[40px] px-3 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Position</label>
            <input
              type="text"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              placeholder="e.g. North Pavilion"
              className="w-full min-h-[40px] px-3 text-sm border border-slate-300 rounded-lg"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Camera Type</label>
            <select
              value={cameraType}
              onChange={(e) => {
                const nextType = e.target.value as CameraType;
                setCameraType(nextType);
                if (nextType === 'smartphone_vdo') setSourceType('vdoninja');
                else if (nextType === 'rtmp_mediamtx') setSourceType('mediamtx');
                else if (nextType === 'browser_source') setSourceType('browser_source');
                else setSourceType('obs_input');
              }}
              className="w-full min-h-[40px] px-3 text-sm border border-slate-300 rounded-lg bg-white"
            >
              <option value="smartphone_vdo">Smartphone Camera (VDO.Ninja WebRTC)</option>
              <option value="rtmp_mediamtx">RTMP / Larix Mobile Feed (MediaMTX)</option>
              <option value="browser_source">Custom Browser Source URL</option>
              <option value="usb_capture">USB / HDMI Capture Card (Local OBS)</option>
              <option value="ip_camera">IP / RTSP Camera (Local OBS)</option>
              <option value="obs_scene_only">Pre-Configured OBS Scene Only</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Video Transport</label>
            <select
              value={sourceType}
              onChange={(e) => setSourceType(e.target.value as CameraSourceType)}
              className="w-full min-h-[40px] px-3 text-sm border border-slate-300 rounded-lg bg-white"
            >
              <option value="vdoninja">VDO.Ninja (Free / Mobile Browser)</option>
              <option value="browser_source">Generic Browser Source URL</option>
              <option value="mediamtx">MediaMTX HLS / WebRTC</option>
              <option value="obs_input">Existing Local OBS Source</option>
            </select>
          </div>
        </div>

        {sourceType !== 'vdoninja' && (
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Source URL / Stream Path (Optional for Local OBS Inputs)
            </label>
            <input
              type="text"
              value={connectionUrl}
              onChange={(e) => setConnectionUrl(e.target.value)}
              placeholder="https://... or rtsp://... or leave blank for existing OBS source"
              className="w-full min-h-[40px] px-3 text-xs font-mono border border-slate-300 rounded-lg"
            />
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Resolution</label>
            <select
              value={resolution}
              onChange={(e) => setResolution(e.target.value as BroadcastCameraData['resolution'])}
              className="w-full min-h-[40px] px-2.5 text-xs font-mono border border-slate-300 rounded-lg bg-white"
            >
              <option value="1920x1080">1080p (FHD)</option>
              <option value="1280x720">720p (HD)</option>
              <option value="854x480">480p (4G Safe)</option>
              <option value="640x360">360p (Low BW)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">FPS</label>
            <select
              value={fps}
              onChange={(e) => setFps(e.target.value)}
              className="w-full min-h-[40px] px-2.5 text-xs font-mono border border-slate-300 rounded-lg bg-white"
            >
              <option value="24">24 fps</option>
              <option value="25">25 fps</option>
              <option value="30">30 fps</option>
              <option value="60">60 fps</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Max Bitrate (kbps)</label>
            <input
              type="number"
              min={300}
              max={12000}
              value={bitrateKbps}
              onChange={(e) => setBitrateKbps(e.target.value)}
              className="w-full min-h-[40px] px-3 text-xs font-mono border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Phone Lens</label>
            <select
              value={facingMode}
              onChange={(e) => setFacingMode(e.target.value as 'environment' | 'user')}
              className="w-full min-h-[40px] px-2.5 text-xs border border-slate-300 rounded-lg bg-white"
            >
              <option value="environment">Rear (Main)</option>
              <option value="user">Front (Selfie)</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Orientation / Rotation</label>
            <select
              value={orientationMode}
              onChange={(e) => setOrientationMode(e.target.value as CameraOrientationMode)}
              className="w-full min-h-[40px] px-2.5 text-xs border border-slate-300 rounded-lg bg-white"
            >
              <option value="auto">Auto (Preserve Natural)</option>
              <option value="0">0° (Standard)</option>
              <option value="90">90° Clockwise</option>
              <option value="180">180° Upside-Down</option>
              <option value="270">270° Counter-CW</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">16:9 Frame Fit Mode</label>
            <select
              value={previewFit}
              onChange={(e) => setPreviewFit(e.target.value as CameraPreviewFit)}
              className="w-full min-h-[40px] px-2.5 text-xs border border-slate-300 rounded-lg bg-white"
            >
              <option value="contain">Contain (Full Frame, Zero Crop)</option>
              <option value="cover">Cover (Crop to Fill 16:9)</option>
              <option value="fill">Fill (Stretch to 16:9)</option>
            </select>
          </div>
          <div className="flex items-end pb-2">
            <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={portraitBackdropFill}
                onChange={(e) => setPortraitBackdropFill(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-[#EA580C]"
              />
              <span>Blur Backdrop for Portrait</span>
            </label>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">OBS Scene Name</label>
            <input
              type="text"
              value={obsSceneName}
              onChange={(e) => setObsSceneName(e.target.value)}
              placeholder="e.g. CAM 1 FULL"
              className="w-full min-h-[40px] px-3 text-xs font-mono border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">OBS Source Name</label>
            <input
              type="text"
              value={obsInputName}
              onChange={(e) => setObsInputName(e.target.value)}
              placeholder="e.g. ML_CAM_1"
              className="w-full min-h-[40px] px-3 text-xs font-mono border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Camera Operator</label>
            <select
              value={operatorUserId}
              onChange={(e) => {
                const id = e.target.value;
                setOperatorUserId(id);
                const found = operators.find((o) => o.id === id);
                if (found) setOperatorName(found.name);
              }}
              className="w-full min-h-[40px] px-2.5 text-xs border border-slate-300 rounded-lg bg-white"
            >
              <option value="">Unassigned</option>
              {operators.map((op) => (
                <option key={op.id} value={op.id}>
                  {op.name} ({op.role})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-5 pt-1">
          <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={lowBandwidthMode}
              onChange={(e) => setLowBandwidthMode(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-[#EA580C]"
            />
            <span>Low-Bandwidth Ground Mode (4G Safe)</span>
          </label>
          <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-[#EA580C]"
            />
            <span>Default Primary Camera</span>
          </label>
          <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-[#EA580C]"
            />
            <span>Enabled</span>
          </label>
          {!editingCamera && (
            <div className="inline-flex items-center gap-2 text-xs font-medium text-slate-700">
              <span>QR Link Expiry:</span>
              <select
                value={expiresInHours}
                onChange={(e) => setExpiresInHours(e.target.value)}
                className="min-h-[32px] px-2 text-xs font-mono border border-slate-300 rounded-lg bg-white"
              >
                <option value="2">2 hours</option>
                <option value="6">6 hours</option>
                <option value="12">12 hours</option>
                <option value="24">24 hours</option>
                <option value="48">48 hours</option>
              </select>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="min-h-[40px] px-5 py-2 text-xs font-semibold text-white bg-[#EA580C] rounded-lg hover:bg-orange-600 disabled:opacity-50"
          >
            {saving ? 'Saving Camera...' : editingCamera ? 'Save Camera Changes' : 'Create Camera'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

interface SmartphoneWizardModalProps {
  open: boolean;
  onClose: () => void;
  camera: BroadcastCameraData | null;
  mobileConnectUrl: string | null;
  onRotateLink: (cameraId: string, expiresInHours?: number) => Promise<void>;
}

export function SmartphoneWizardModal({
  open,
  onClose,
  camera,
  mobileConnectUrl,
  onRotateLink,
}: SmartphoneWizardModalProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [rotating, setRotating] = useState(false);
  const [expiresInHours, setExpiresInHours] = useState(12);

  const effectiveUrl = mobileConnectUrl || camera?.vdoPushUrl || '';

  useEffect(() => {
    if (!open || !effectiveUrl) {
      setQrDataUrl('');
      return;
    }
    QRCode.toDataURL(effectiveUrl, {
      width: 240,
      margin: 1,
      color: { dark: '#0F172A', light: '#FFFFFF' },
    })
      .then((url) => setQrDataUrl(url))
      .catch(() => setQrDataUrl(''));
  }, [open, effectiveUrl]);

  function copy(key: string, val: string) {
    if (!val) return;
    navigator.clipboard?.writeText(val).catch(() => {});
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey(null), 1800);
  }

  if (!camera) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Connect Smartphone — ${camera.name} (${camera.label})`}
      subtitle="Scan the QR code on the ground smartphone or paste the clean OBS Browser Source URL into OBS Studio."
      maxWidthClass="max-w-2xl"
    >
      <div className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center">
          <div className="md:col-span-5 flex flex-col items-center justify-center p-4 rounded-xl border border-slate-200 bg-slate-50">
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt={`QR code to connect ${camera.name}`}
                className="w-48 h-48 rounded-lg border border-slate-200 bg-white p-1"
              />
            ) : (
              <div className="w-48 h-48 flex flex-col items-center justify-center text-xs text-slate-500 text-center p-4">
                <QrCode className="w-8 h-8 mb-2 text-slate-400" />
                <span>Click &ldquo;Generate Fresh Phone Link&rdquo; below to mint a secure QR code.</span>
              </div>
            )}
            <p className="text-[11px] font-mono text-slate-600 mt-2 text-center">
              ID: {camera.cameraId} · {camera.resolution} @ {camera.fps}fps
            </p>
            {(camera.broadcastSessionId || camera.pushTokenExpiresAt) && (
              <p className="text-[10px] font-mono text-slate-500 mt-1 text-center">
                {camera.broadcastSessionId ? `Session ${camera.broadcastSessionId} · ` : ''}
                {camera.pushTokenExpiresAt
                  ? `Expires ${new Date(camera.pushTokenExpiresAt).toLocaleString()}`
                  : ''}
              </p>
            )}
          </div>

          <div className="md:col-span-7 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-800">
                <Smartphone className="w-4 h-4 text-[#EA580C]" />
                <span>Step 1: Open Companion Link on Phone</span>
              </span>
              <div className="flex items-center gap-1.5">
                <select
                  aria-label="QR link expiration"
                  value={expiresInHours}
                  onChange={(e) => setExpiresInHours(Number(e.target.value) || 12)}
                  className="min-h-[28px] px-2 text-[11px] font-mono border border-slate-300 rounded-md bg-white"
                >
                  <option value={2}>2h</option>
                  <option value={6}>6h</option>
                  <option value={12}>12h</option>
                  <option value={24}>24h</option>
                  <option value={48}>48h</option>
                </select>
                <button
                  type="button"
                  disabled={rotating}
                  onClick={async () => {
                    try {
                      setRotating(true);
                      await onRotateLink(camera.cameraId, expiresInHours);
                    } finally {
                      setRotating(false);
                    }
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-[#EA580C] bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3 h-3 ${rotating ? 'animate-spin' : ''}`} />
                  <span>{mobileConnectUrl ? 'Rotate Phone Link' : 'Generate Fresh Phone Link'}</span>
                </button>
              </div>
            </div>

            {mobileConnectUrl ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={mobileConnectUrl}
                  onFocus={(e) => e.currentTarget.select()}
                  className="flex-1 min-h-[38px] px-3 text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg"
                />
                <button
                  type="button"
                  onClick={() => copy('mobile', mobileConnectUrl)}
                  className="min-h-[38px] inline-flex items-center gap-1 px-3 text-xs font-semibold bg-slate-900 text-white rounded-lg"
                >
                  {copiedKey === 'mobile' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>Copy</span>
                </button>
                <a
                  href={mobileConnectUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[38px] inline-flex items-center justify-center px-2.5 text-xs font-semibold border border-slate-300 rounded-lg hover:bg-slate-50"
                  title="Open Phone Link"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            ) : (
              <p className="text-xs text-slate-600 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                For security, the camera companion link token is hashed after generation. Click{' '}
                <strong>Generate Fresh Phone Link</strong> to mint a new QR code &amp; link, or copy the direct VDO.Ninja push URL below.
              </p>
            )}

            {camera.vdoPushUrl && (
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Direct VDO.Ninja Camera Push URL
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={camera.vdoPushUrl}
                    onFocus={(e) => e.currentTarget.select()}
                    className="flex-1 min-h-[36px] px-3 text-[11px] font-mono bg-slate-50 border border-slate-300 rounded-lg"
                  />
                  <button
                    type="button"
                    onClick={() => copy('push', camera.vdoPushUrl || '')}
                    className="min-h-[36px] inline-flex items-center gap-1 px-3 text-xs font-semibold border border-slate-300 rounded-lg hover:bg-slate-50"
                  >
                    {copiedKey === 'push' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>Copy</span>
                  </button>
                </div>
              </div>
            )}

            {camera.obsBrowserSourceUrl && (
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Step 2: OBS Browser Source URL (Auto-injected on switch, or paste manually)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={camera.obsBrowserSourceUrl}
                    onFocus={(e) => e.currentTarget.select()}
                    className="flex-1 min-h-[36px] px-3 text-[11px] font-mono bg-slate-50 border border-slate-300 rounded-lg"
                  />
                  <button
                    type="button"
                    onClick={() => copy('obs', camera.obsBrowserSourceUrl || '')}
                    className="min-h-[36px] inline-flex items-center gap-1 px-3 text-xs font-semibold border border-slate-300 rounded-lg hover:bg-slate-50"
                  >
                    {copiedKey === 'obs' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>Copy</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700">
          <div className="flex items-start gap-2">
            <Camera className="w-4 h-4 text-[#EA580C] shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-slate-900">Landscape &amp; Lens</p>
              <p className="text-[11px] text-slate-600">Lock phone rotation to landscape and wipe rear lens clean.</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <BatteryCharging className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-slate-900">Heat &amp; Battery</p>
              <p className="text-[11px] text-slate-600">Lower screen brightness &amp; use a tripod + shade for long matches.</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Wifi className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-slate-900">Ground Uplink</p>
              <p className="text-[11px] text-slate-600">Use 720p @ 30fps on 4G/5G; toggle Low-Bandwidth on weak turf.</p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-slate-200">
          <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-500">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>Room passwords are encrypted at rest and links are scoped per camera.</span>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[38px] px-4 py-2 text-xs font-semibold bg-slate-900 text-white rounded-lg hover:bg-slate-800"
          >
            Done
          </button>
        </div>
      </div>
    </Modal>
  );
}
