import React, { useId, useRef, useState } from 'react';
import { CheckCircle2, FileText, Loader2, Upload, X } from 'lucide-react';
import { UploadFolder, uploadService } from '../../services/upload/uploadService.ts';

interface FileUploadFieldProps {
  label: string;
  value: string;
  onChange: (url: string) => void;
  folder?: UploadFolder;
  portal?: 'admin' | 'customer';
  accept?: string;
  placeholder?: string;
  helperText?: string;
  compact?: boolean;
}

function isLikelyImageUrl(url: string): boolean {
  if (!url) return false;
  if (/\.(png|jpe?g|gif|webp|svg|avif|ico)(\?.*)?$/i.test(url)) return true;
  if (url.includes('/image/upload/') || url.startsWith('/src/assets/')) return true;
  return true;
}

export function FileUploadField({
  label,
  value,
  onChange,
  folder = 'general',
  portal = 'admin',
  accept = 'image/*',
  placeholder = 'Upload a file or paste https://...',
  helperText,
  compact = false,
}: FileUploadFieldProps) {
  const inputId = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadedNow, setUploadedNow] = useState(false);
  const [previewError, setPreviewError] = useState(false);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    try {
      setUploading(true);
      setUploadError(null);
      setUploadedNow(false);
      setPreviewError(false);

      const result = await uploadService.uploadFile(file, { folder, portal });
      onChange(result.url);
      setUploadedNow(true);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Failed to upload file.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <label
        htmlFor={inputId}
        className={`block font-medium ${
          compact ? 'text-xs text-slate-600' : 'text-sm text-slate-700'
        }`}
      >
        {label}
      </label>

      <div className="flex items-center gap-2">
        {value && !previewError && isLikelyImageUrl(value) ? (
          <img
            src={value}
            alt={label}
            referrerPolicy="no-referrer"
            onError={() => setPreviewError(true)}
            className={`${
              compact ? 'w-9 h-9' : 'w-10 h-10'
            } rounded-lg object-cover border border-slate-200 bg-white shrink-0`}
          />
        ) : value ? (
          <div
            className={`${
              compact ? 'w-9 h-9' : 'w-10 h-10'
            } rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-center shrink-0 text-slate-500`}
          >
            <FileText className="w-4 h-4" />
          </div>
        ) : null}

        <input
          id={inputId}
          type="url"
          value={value}
          onChange={(e) => {
            setPreviewError(false);
            setUploadedNow(false);
            setUploadError(null);
            onChange(e.target.value);
          }}
          placeholder={placeholder}
          className={`flex-1 min-w-0 ${
            compact ? 'min-h-[40px] py-1.5' : 'min-h-[42px] py-2'
          } px-3 text-sm border border-slate-300 rounded-lg bg-white`}
        />

        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          onChange={handleFileChange}
          className="hidden"
        />

        <button
          type="button"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
          className={`${
            compact ? 'min-h-[40px] px-3 text-xs' : 'min-h-[42px] px-3.5 text-xs'
          } inline-flex items-center gap-1.5 font-semibold text-slate-800 bg-slate-100 border border-slate-300 rounded-lg hover:bg-slate-200 disabled:opacity-60 whitespace-nowrap shrink-0`}
        >
          {uploading ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Uploading...</span>
            </>
          ) : (
            <>
              <Upload className="w-3.5 h-3.5" />
              <span>Upload</span>
            </>
          )}
        </button>

        {value && !uploading && (
          <button
            type="button"
            title="Clear file URL"
            onClick={() => {
              setUploadedNow(false);
              setPreviewError(false);
              setUploadError(null);
              onChange('');
            }}
            className={`${
              compact ? 'min-h-[40px] w-9' : 'min-h-[42px] w-10'
            } inline-flex items-center justify-center text-slate-500 hover:text-slate-800 bg-white border border-slate-300 rounded-lg shrink-0`}
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {uploadedNow && value && (
        <p className="text-xs text-emerald-700 flex items-center gap-1">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          <span>Uploaded to Cloudinary — link ready to save in database.</span>
        </p>
      )}

      {uploadError && <p className="text-xs text-red-600">{uploadError}</p>}

      {helperText && !uploadError && !uploadedNow && (
        <p className="text-xs text-slate-500">{helperText}</p>
      )}
    </div>
  );
}
