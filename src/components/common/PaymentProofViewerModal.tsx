import { useEffect, useState } from 'react';
import { Download, FileText, Loader2, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
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
  fileName = 'payment-proof',
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
          setError(err.response?.data?.message || 'Unable to load payment proof.');
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

  const isPdf = (mimeType || '').includes('pdf') || fileName.toLowerCase().endsWith('.pdf');
  const isImage = !isPdf && ((mimeType || '').startsWith('image/') || /\.(jpg|jpeg|png|webp)$/i.test(fileName));

  return (
    <Modal open={open} onClose={onClose} title={title} maxWidthClass="max-w-3xl">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
          <span className="text-xs font-medium text-slate-600 truncate max-w-[260px]">
            {fileName}
          </span>
          <div className="flex items-center gap-1.5">
            {isImage && objectUrl && (
              <>
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.max(0.5, Number((z - 0.25).toFixed(2))))}
                  className="min-h-[30px] px-2 py-1 text-xs font-semibold rounded border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 inline-flex items-center gap-1"
                  title="Zoom out"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="text-xs font-mono font-semibold text-slate-700 px-1.5">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.min(3, Number((z + 0.25).toFixed(2))))}
                  className="min-h-[30px] px-2 py-1 text-xs font-semibold rounded border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 inline-flex items-center gap-1"
                  title="Zoom in"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setZoom(1)}
                  className="min-h-[30px] px-2 py-1 text-xs font-semibold rounded border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 inline-flex items-center gap-1"
                  title="Reset zoom"
                >
                  <RotateCcw className="w-3 h-3" />
                </button>
              </>
            )}
            <button
              type="button"
              onClick={handleDownload}
              className="min-h-[30px] inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded bg-[#0F172A] text-white hover:bg-slate-800"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download</span>
            </button>
          </div>
        </div>

        {loading ? (
          <div className="py-16 flex items-center justify-center gap-2 text-xs text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin text-[#EA580C]" />
            <span>Loading protected file...</span>
          </div>
        ) : error ? (
          <div className="p-6 text-center rounded-xl bg-red-50 border border-red-200 text-xs font-medium text-red-700">
            {error}
          </div>
        ) : isImage && objectUrl ? (
          <div className="bg-slate-900 rounded-xl p-3 max-h-[68vh] overflow-auto flex items-center justify-center">
            <img
              src={objectUrl}
              alt={fileName}
              style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
              className="max-w-full max-h-[62vh] object-contain transition-transform duration-150 rounded"
            />
          </div>
        ) : isPdf && objectUrl ? (
          <iframe
            src={objectUrl}
            title={fileName}
            className="w-full h-[68vh] rounded-xl border border-slate-200 bg-white"
          />
        ) : (
          <div className="p-10 text-center bg-slate-50 rounded-xl border border-slate-200 space-y-2">
            <FileText className="w-10 h-10 text-slate-400 mx-auto" />
            <p className="text-sm font-semibold text-slate-800">{fileName}</p>
            <p className="text-xs text-slate-500">Use Download above to inspect this file.</p>
          </div>
        )}
      </div>
    </Modal>
  );
}
