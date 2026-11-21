import { useEffect, useState } from 'react';
import {
  Download,
  ExternalLink,
  FileText,
  Loader2,
  RotateCcw,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { Modal } from './Modal.tsx';
import { platformOpsService } from '../../services/platformOps/platformOpsService.ts';

interface PaymentProofViewerModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  fileUrlPath: string;
  fileName?: string;
  mimeTypeHint?: string;
  portal: 'customer' | 'admin';
}

export function PaymentProofViewerModal({
  open,
  onClose,
  title,
  fileUrlPath,
  fileName = 'uploaded-document',
  mimeTypeHint = '',
  portal,
}: PaymentProofViewerModalProps) {
  const [objectUrl, setObjectUrl] = useState('');
  const [mimeType, setMimeType] = useState(mimeTypeHint);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    if (!open || !fileUrlPath) return;
    let active = true;
    let createdUrl = '';
    setLoading(true);
    setError('');
    setZoom(1);
    setMimeType(mimeTypeHint);

    platformOpsService
      .fetchProtectedFileBlob(fileUrlPath, portal)
      .then((res) => {
        if (!active) {
          URL.revokeObjectURL(res.objectUrl);
          return;
        }
        createdUrl = res.objectUrl;
        setObjectUrl(res.objectUrl);
        setMimeType(res.mimeType || mimeTypeHint);
      })
      .catch((err: any) => {
        if (active) {
          setError(err?.response?.data?.message || 'Unable to load protected document preview.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
      setObjectUrl('');
    };
  }, [open, fileUrlPath, portal, mimeTypeHint]);

  const handleDownload = async () => {
    try {
      const res = await platformOpsService.fetchProtectedFileBlob(
        `${fileUrlPath}${fileUrlPath.includes('?') ? '&' : '?'}download=1`,
        portal
      );
      const a = document.createElement('a');
      a.href = res.objectUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(res.objectUrl), 1500);
    } catch {
      // Ignore transient download issue
    }
  };

  const lowerName = fileName.toLowerCase();
  const normalizedMime = (mimeType || '').toLowerCase();
  const isPdf = normalizedMime.includes('pdf') || lowerName.endsWith('.pdf');
  const isImage =
    !isPdf &&
    (normalizedMime.startsWith('image/') ||
      /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(lowerName));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      subtitle={fileName}
      maxWidthClass="max-w-5xl"
      zIndexClass="z-[120]"
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-medium text-slate-700 truncate max-w-[220px] sm:max-w-[360px]">
              {fileName}
            </span>
            {normalizedMime && (
              <span className="hidden sm:inline-block px-1.5 py-0.5 rounded bg-slate-200/70 text-[10px] font-mono text-slate-600">
                {normalizedMime}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {isImage && objectUrl && (
              <>
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.max(0.5, Number((z - 0.25).toFixed(2))))}
                  className="min-h-[32px] px-2 py-1 text-xs font-semibold rounded border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 inline-flex items-center gap-1"
                  title="Zoom out"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="text-xs font-mono font-semibold text-slate-700 px-1.5 min-w-[46px] text-center">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.min(3, Number((z + 0.25).toFixed(2))))}
                  className="min-h-[32px] px-2 py-1 text-xs font-semibold rounded border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 inline-flex items-center gap-1"
                  title="Zoom in"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setZoom(1)}
                  className="min-h-[32px] px-2 py-1 text-xs font-semibold rounded border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 inline-flex items-center gap-1"
                  title="Reset zoom"
                >
                  <RotateCcw className="w-3 h-3" />
                </button>
              </>
            )}
            {objectUrl && (
              <a
                href={objectUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[32px] inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Open in New Tab</span>
              </a>
            )}
            <button
              type="button"
              onClick={handleDownload}
              className="min-h-[32px] inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded bg-[#0F172A] text-white hover:bg-slate-800"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download</span>
            </button>
          </div>
        </div>

        {loading ? (
          <div className="py-20 flex items-center justify-center gap-2 text-xs text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin text-[#EA580C]" />
            <span>Loading protected file...</span>
          </div>
        ) : error ? (
          <div className="p-6 text-center rounded-xl bg-red-50 border border-red-200 text-xs font-medium text-red-700">
            {error}
          </div>
        ) : isImage && objectUrl ? (
          <div className="bg-slate-950 rounded-xl p-3 sm:p-4 max-h-[72vh] overflow-auto flex items-center justify-center">
            <img
              src={objectUrl}
              alt={fileName}
              style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
              className="max-w-full max-h-[66vh] object-contain transition-transform duration-150 rounded shadow-lg"
            />
          </div>
        ) : isPdf && objectUrl ? (
          <iframe
            src={objectUrl}
            title={fileName}
            className="w-full h-[68vh] sm:h-[74vh] rounded-xl border border-slate-200 bg-white"
          />
        ) : (
          <div className="p-10 text-center bg-slate-50 rounded-xl border border-slate-200 space-y-3">
            <FileText className="w-10 h-10 text-slate-400 mx-auto" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-slate-800">{fileName}</p>
              {normalizedMime && (
                <p className="text-xs font-mono text-slate-500">{normalizedMime}</p>
              )}
              <p className="text-xs text-slate-500">
                Inline preview is unavailable for this file format. Use Download or Open in New Tab to inspect it.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleDownload}
                className="min-h-[36px] inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-[#0F172A] text-white hover:bg-slate-800"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download File</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
