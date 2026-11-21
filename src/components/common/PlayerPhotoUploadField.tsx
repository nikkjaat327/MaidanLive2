import React, { useEffect, useRef, useState } from 'react';
import { Camera, Loader2, RefreshCw, Trash2, User } from 'lucide-react';
import { compressPlayerPhoto } from '../../utils/imageCompression.ts';
import { platformOpsService } from '../../services/platformOps/platformOpsService.ts';
import { extractApiError } from '../../services/api/httpClient.ts';

interface PlayerPhotoUploadFieldProps {
  playerName?: string;
  avatarUrl?: string;
  avatarPublicId?: string;
  portal?: 'customer' | 'admin';
  compact?: boolean;
  onChange: (next: { avatarUrl: string; avatarPublicId: string }) => void;
}

export function PlayerPhotoUploadField({
  playerName = '',
  avatarUrl = '',
  portal = 'customer',
  compact = false,
  onChange,
}: PlayerPhotoUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const lastFileRef = useRef<File | null>(null);
  const [localPreview, setLocalPreview] = useState<string>('');
  const [stage, setStage] = useState<'idle' | 'compressing' | 'uploading'>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (localPreview) {
        URL.revokeObjectURL(localPreview);
      }
    };
  }, [localPreview]);

  async function processAndUpload(rawFile: File) {
    lastFileRef.current = rawFile;
    setError(null);
    setProgress(0);
    setStage('compressing');
    let previewUrl = '';
    try {
      const compressed = await compressPlayerPhoto(rawFile);
      previewUrl = compressed.previewUrl;
      setLocalPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return compressed.previewUrl;
      });

      setStage('uploading');
      const uploaded = await platformOpsService.uploadPlayerPhoto(
        compressed.file,
        (pct) => setProgress(pct),
        portal
      );
      onChange({
        avatarUrl: uploaded.url,
        avatarPublicId: uploaded.publicId,
      });
      setLocalPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return '';
      });
      setStage('idle');
    } catch (err) {
      if (previewUrl) {
        setLocalPreview((prev) => {
          if (prev && prev !== previewUrl) URL.revokeObjectURL(prev);
          return '';
        });
      }
      setStage('idle');
      setError(
        err instanceof Error && !('isAxiosError' in err)
          ? err.message
          : extractApiError(err, 'Failed to upload player photo.')
      );
    }
  }

  function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    void processAndUpload(file);
  }

  function handleRemove() {
    lastFileRef.current = null;
    setError(null);
    setLocalPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return '';
    });
    onChange({ avatarUrl: '', avatarPublicId: '' });
  }

  const displayUrl = localPreview || avatarUrl;
  const initials = playerName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2.5">
        <input
          ref={inputRef}
          type="file"
          accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
          onChange={handleFileSelected}
          className="hidden"
        />

        {displayUrl ? (
          <img
            src={displayUrl}
            alt={playerName ? `${playerName} photo` : 'Player photo'}
            className={`${
              compact ? 'w-9 h-9' : 'w-11 h-11'
            } rounded-full object-cover border border-slate-300 bg-white shrink-0`}
          />
        ) : (
          <div
            aria-hidden="true"
            className={`${
              compact ? 'w-9 h-9 text-[11px]' : 'w-11 h-11 text-xs'
            } rounded-full bg-slate-200 text-slate-600 font-bold flex items-center justify-center shrink-0`}
          >
            {initials || <User className="w-4 h-4" />}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            disabled={stage !== 'idle'}
            onClick={() => inputRef.current?.click()}
            className="min-h-[30px] inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-300 bg-white text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {stage !== 'idle' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#EA580C]" />
            ) : (
              <Camera className="w-3.5 h-3.5 text-slate-500" />
            )}
            <span>
              {stage === 'compressing'
                ? 'Compressing...'
                : stage === 'uploading'
                  ? `Uploading ${progress}%`
                  : displayUrl
                    ? 'Replace Photo'
                    : 'Upload Photo (Optional)'}
            </span>
          </button>

          {displayUrl && stage === 'idle' && (
            <button
              type="button"
              onClick={handleRemove}
              className="min-h-[30px] inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-red-200 bg-red-50/70 text-[11px] font-semibold text-red-600 hover:bg-red-100"
            >
              <Trash2 className="w-3 h-3" />
              <span>Remove</span>
            </button>
          )}

          {error && lastFileRef.current && stage === 'idle' && (
            <button
              type="button"
              onClick={() => lastFileRef.current && void processAndUpload(lastFileRef.current)}
              className="min-h-[30px] inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-amber-300 bg-amber-50 text-[11px] font-semibold text-amber-800 hover:bg-amber-100"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Retry</span>
            </button>
          )}
        </div>
      </div>

      {error && <p className="text-[11px] font-medium text-red-600">{error}</p>}
    </div>
  );
}
