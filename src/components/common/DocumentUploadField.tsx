import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Download, Eye, FileText, HardDrive, Loader2, RefreshCw, Upload, X } from 'lucide-react';
import { StoredDocMeta } from '../../types/index.ts';
import {
  downloadGoogleDriveFileAsFile,
  getCachedDriveAccessToken,
  initGoogleDriveAuth,
  openGoogleDrivePicker,
  signInWithGoogleDrive,
} from '../../services/drive/googleDriveService.ts';
import { platformOpsService } from '../../services/platformOps/platformOpsService.ts';
import { ConfirmDialog } from './ConfirmDialog.tsx';
import { Modal } from './Modal.tsx';

interface DocumentUploadFieldProps {
  label: string;
  helperText?: string;
  purpose: 'VERIFICATION_DOC' | 'PAYMENT_PROOF';
  accept: string;
  allowedMimeTypesForPicker: string[];
  maxSizeBytes?: number;
  value: StoredDocMeta | null;
  tournamentId?: string;
  registrationId?: string;
  disabled?: boolean;
  onUploaded: (meta: StoredDocMeta & { id?: string }) => void;
  onClear?: () => void;
}

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;

function formatBytes(bytes?: number) {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function getExt(name: string) {
  const idx = name.lastIndexOf('.');
  return idx >= 0 ? name.slice(idx).toLowerCase() : '';
}

export function DocumentUploadField({
  label,
  helperText,
  purpose,
  accept,
  allowedMimeTypesForPicker,
  maxSizeBytes = DEFAULT_MAX_BYTES,
  value,
  tournamentId,
  registrationId,
  disabled = false,
  onUploaded,
}: DocumentUploadFieldProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [driveReady, setDriveReady] = useState(Boolean(getCachedDriveAccessToken()));
  const [driveConnecting, setDriveConnecting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [replaceAction, setReplaceAction] = useState<'DEVICE' | 'DRIVE' | null>(null);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewMime, setPreviewMime] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    const unsub = initGoogleDriveAuth(
      () => setDriveReady(true),
      () => setDriveReady(false)
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const validateClientFile = (file: File): string | null => {
    if (file.size <= 0) return 'Selected file is empty.';
    if (file.size > maxSizeBytes) {
      return `File is too large (${formatBytes(file.size)}). Maximum allowed size is ${formatBytes(maxSizeBytes)}.`;
    }
    const allowedExts =
      purpose === 'PAYMENT_PROOF'
        ? ['.jpg', '.jpeg', '.png', '.webp', '.pdf']
        : ['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.doc', '.docx'];
    const ext = getExt(file.name);
    if (!allowedExts.includes(ext)) {
      return `Unsupported file type. Allowed formats: ${allowedExts.join(', ').toUpperCase()}.`;
    }
    return null;
  };

  const performUpload = async (
    file: File,
    source: 'DEVICE' | 'GOOGLE_DRIVE',
    driveFileId?: string,
    driveWebViewLink?: string
  ) => {
    const validationErr = validateClientFile(file);
    if (validationErr) {
      setError(validationErr);
      return;
    }

    setError('');
    setUploading(true);
    setProgress(10);
    try {
      const uploaded = await platformOpsService.uploadDocument({
        file,
        purpose,
        source,
        driveFileId,
        driveWebViewLink,
        tournamentId,
        registrationId,
        onProgress: (pct) => setProgress(pct),
      });
      onUploaded(uploaded);
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Upload failed.');
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  const handleDeviceFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    await performUpload(file, 'DEVICE');
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setDriveConnecting(true);
    try {
      await signInWithGoogleDrive();
      setDriveReady(true);
    } catch (err: any) {
      setError(err.message || 'Google sign-in was cancelled or failed.');
    } finally {
      setDriveConnecting(false);
    }
  };

  const handlePickFromDrive = async () => {
    setError('');
    let token = getCachedDriveAccessToken();
    if (!token) {
      setDriveConnecting(true);
      try {
        const res = await signInWithGoogleDrive();
        token = res.accessToken;
        setDriveReady(true);
      } catch (err: any) {
        setError(err.message || 'Please sign in with Google to access Google Drive.');
        setDriveConnecting(false);
        return;
      } finally {
        setDriveConnecting(false);
      }
    }

    try {
      const picked = await openGoogleDrivePicker({
        accessToken: token,
        mimeTypes: allowedMimeTypesForPicker,
        title:
          purpose === 'PAYMENT_PROOF'
            ? 'Select Payment Screenshot / Receipt from Google Drive'
            : 'Select Team Verification Document from Google Drive',
      });
      if (!picked) return;

      setUploading(true);
      setProgress(25);
      const downloadedFile = await downloadGoogleDriveFileAsFile({
        accessToken: token,
        picked,
      });
      await performUpload(downloadedFile, 'GOOGLE_DRIVE', picked.id, picked.url);
    } catch (err: any) {
      setUploading(false);
      setProgress(0);
      setError(err.message || 'Failed to import document from Google Drive.');
    }
  };

  const triggerDevicePicker = () => {
    if (value?.fileId) {
      setReplaceAction('DEVICE');
    } else {
      fileInputRef.current?.click();
    }
  };

  const triggerDrivePicker = () => {
    if (value?.fileId) {
      setReplaceAction('DRIVE');
    } else {
      handlePickFromDrive();
    }
  };

  const handleOpenPreview = async () => {
    if (!value?.fileId) return;
    setPreviewOpen(true);
    setPreviewLoading(true);
    setError('');
    try {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      const res = await platformOpsService.fetchProtectedFileBlob(`/v1/documents/${value.fileId}`, 'customer');
      setPreviewUrl(res.objectUrl);
      setPreviewMime(res.mimeType || value.mimeType);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Unable to load document preview.');
      setPreviewOpen(false);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!value?.fileId) return;
    try {
      const res = await platformOpsService.fetchProtectedFileBlob(
        `/v1/documents/${value.fileId}?download=1`,
        'customer'
      );
      const a = document.createElement('a');
      a.href = res.objectUrl;
      a.download = value.fileName || 'document';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(res.objectUrl), 1500);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Unable to download document.');
    }
  };

  const isImage = (previewMime || value?.mimeType || '').startsWith('image/');
  const isPdf = (previewMime || value?.mimeType || '').includes('pdf');

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="block text-xs font-semibold text-slate-700">{label}</label>
        {helperText && <span className="text-[11px] text-slate-500">{helperText}</span>}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        onChange={handleDeviceFileSelected}
        className="hidden"
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={disabled || uploading}
          onClick={triggerDevicePicker}
          className="min-h-[34px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 disabled:opacity-50"
        >
          {value?.fileId ? <RefreshCw className="w-3.5 h-3.5" /> : <Upload className="w-3.5 h-3.5" />}
          <span>{value?.fileId ? 'Replace from Device' : 'Upload from Device'}</span>
        </button>

        {!driveReady ? (
          <button
            type="button"
            disabled={disabled || uploading || driveConnecting}
            onClick={handleGoogleSignIn}
            className="gsi-material-button min-h-[34px] inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-800 text-xs font-semibold hover:bg-slate-50 disabled:opacity-50 shadow-2xs"
          >
            <span className="gsi-material-button-icon w-4 h-4 shrink-0 inline-block">
              <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" style={{ display: 'block' }}>
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                <path fill="none" d="M0 0h48v48H0z" />
              </svg>
            </span>
            <span className="gsi-material-button-contents">
              {driveConnecting ? 'Connecting...' : 'Sign in with Google (Drive)'}
            </span>
          </button>
        ) : (
          <button
            type="button"
            disabled={disabled || uploading}
            onClick={triggerDrivePicker}
            className="min-h-[34px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50"
          >
            <HardDrive className="w-3.5 h-3.5" />
            <span>{value?.fileId ? 'Replace via Google Drive' : 'Choose from Google Drive'}</span>
          </button>
        )}
      </div>

      {uploading && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px] font-medium text-slate-600">
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin text-[#EA580C]" />
              Uploading document...
            </span>
            <span>{progress}%</span>
          </div>
          <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#EA580C] transition-all duration-200"
              style={{ width: `${Math.max(8, progress)}%` }}
            />
          </div>
        </div>
      )}

      {value?.fileId && (
        <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg border border-emerald-200 bg-emerald-50/70">
          <div className="flex items-center gap-2 min-w-0">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-900 truncate">{value.fileName}</p>
              <p className="text-[11px] text-slate-600">
                {value.source === 'GOOGLE_DRIVE' ? 'Imported from Google Drive' : 'Uploaded from Device'}
                {value.sizeBytes ? ` · ${formatBytes(value.sizeBytes)}` : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleOpenPreview}
              className="min-h-[30px] inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-md bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
            >
              <Eye className="w-3 h-3" />
              <span>Preview</span>
            </button>
            <button
              type="button"
              onClick={handleDownload}
              className="min-h-[30px] inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-md bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
            >
              <Download className="w-3 h-3" />
              <span>Download</span>
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="text-xs font-medium text-red-600 flex items-center gap-1">
          <X className="w-3.5 h-3.5 shrink-0" />
          <span>{error}</span>
        </p>
      )}

      <ConfirmDialog
        open={replaceAction !== null}
        onClose={() => setReplaceAction(null)}
        title="Replace Uploaded Document?"
        message={`Replacing "${value?.fileName || 'existing document'}" will overwrite your current attachment for this registration. Do you want to continue?`}
        confirmLabel="Yes, Replace File"
        cancelLabel="Cancel"
        variant="primary"
        onConfirm={() => {
          const action = replaceAction;
          setReplaceAction(null);
          if (action === 'DEVICE') {
            fileInputRef.current?.click();
          } else if (action === 'DRIVE') {
            handlePickFromDrive();
          }
        }}
      />

      <Modal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title={value?.fileName || 'Document Preview'}
        maxWidthClass="max-w-2xl"
      >
        <div className="space-y-3">
          {previewLoading ? (
            <div className="py-12 flex items-center justify-center gap-2 text-xs text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin text-[#EA580C]" />
              <span>Loading encrypted preview...</span>
            </div>
          ) : isImage && previewUrl ? (
            <div className="bg-slate-900 rounded-xl p-2 flex items-center justify-center max-h-[68vh] overflow-auto">
              <img
                src={previewUrl}
                alt={value?.fileName || 'Document preview'}
                className="max-w-full max-h-[62vh] object-contain rounded"
              />
            </div>
          ) : isPdf && previewUrl ? (
            <iframe
              src={previewUrl}
              title={value?.fileName || 'PDF preview'}
              className="w-full h-[65vh] rounded-xl border border-slate-200"
            />
          ) : (
            <div className="p-8 text-center bg-slate-50 rounded-xl border border-slate-200 space-y-3">
              <FileText className="w-10 h-10 text-slate-400 mx-auto" />
              <p className="text-sm font-semibold text-slate-800">{value?.fileName}</p>
              <p className="text-xs text-slate-500">
                Inline browser preview is unavailable for this document type. Use Download to open it locally.
              </p>
              <button
                type="button"
                onClick={handleDownload}
                className="min-h-[34px] inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#0F172A] text-white text-xs font-semibold rounded-lg"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download File</span>
              </button>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
