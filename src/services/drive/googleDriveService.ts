import { getApp, getApps, initializeApp } from '@firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from '@firebase/auth';
import type { User } from '@firebase/auth';
import firebaseConfig from '../../../firebase-applet-config.json';

export const GOOGLE_DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.metadata.readonly',
];

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);

const provider = new GoogleAuthProvider();
for (const scope of GOOGLE_DRIVE_SCOPES) {
  provider.addScope(scope);
}

// Memory-only OAuth access token cache (never stored in localStorage/sessionStorage)
let cachedDriveAccessToken: string | null = null;
let isSigningIn = false;
let pickerScriptPromise: Promise<void> | null = null;

export interface PickedDriveFile {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes?: number;
  url?: string;
}

export function initGoogleDriveAuth(
  onReady?: (user: User, accessToken: string) => void,
  onSignedOut?: () => void
) {
  return onAuthStateChanged(auth, (user) => {
    if (user && cachedDriveAccessToken) {
      onReady?.(user, cachedDriveAccessToken);
    } else if (!user) {
      cachedDriveAccessToken = null;
      onSignedOut?.();
    } else if (!isSigningIn && !cachedDriveAccessToken) {
      onSignedOut?.();
    }
  });
}

export function getCachedDriveAccessToken(): string | null {
  return cachedDriveAccessToken;
}

export function getCurrentGoogleDriveUser(): User | null {
  return auth.currentUser;
}

export async function signInWithGoogleDrive(): Promise<{ user: User; accessToken: string }> {
  isSigningIn = true;
  try {
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Google authentication did not return a Drive access token.');
    }
    cachedDriveAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedDriveAccessToken };
  } finally {
    isSigningIn = false;
  }
}

export async function signOutGoogleDrive(): Promise<void> {
  cachedDriveAccessToken = null;
  await signOut(auth).catch(() => {});
}

function loadGooglePickerApi(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Google Picker is only available in the browser.'));
  }
  const win = window as any;
  if (win.google?.picker) {
    return Promise.resolve();
  }
  if (pickerScriptPromise) {
    return pickerScriptPromise;
  }

  pickerScriptPromise = new Promise<void>((resolve, reject) => {
    const finishLoad = () => {
      if (!win.gapi) {
        reject(new Error('Google API loader failed to initialize.'));
        return;
      }
      win.gapi.load('picker', {
        callback: () => {
          if (win.google?.picker) resolve();
          else reject(new Error('Google Picker library failed to load.'));
        },
        onerror: () => reject(new Error('Failed to load Google Picker script.')),
      });
    };

    const existing = document.querySelector('script[src="https://apis.google.com/js/api.js"]');
    if (existing) {
      if (win.gapi) finishLoad();
      else existing.addEventListener('load', finishLoad, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/api.js';
    script.async = true;
    script.defer = true;
    script.onload = finishLoad;
    script.onerror = () => {
      pickerScriptPromise = null;
      reject(new Error('Could not load Google Picker API script.'));
    };
    document.head.appendChild(script);
  });

  return pickerScriptPromise;
}

export async function openGoogleDrivePicker(params: {
  accessToken: string;
  mimeTypes?: string[];
  title?: string;
}): Promise<PickedDriveFile | null> {
  await loadGooglePickerApi();
  const win = window as any;
  const gPicker = win.google.picker;

  const pickerOrigin =
    window.location.ancestorOrigins && window.location.ancestorOrigins.length > 0
      ? window.location.ancestorOrigins[window.location.ancestorOrigins.length - 1]
      : window.location.origin;

  return new Promise<PickedDriveFile | null>((resolve) => {
    const docsView = new gPicker.DocsView(gPicker.ViewId.DOCS);
    if (params.mimeTypes && params.mimeTypes.length > 0) {
      docsView.setMimeTypes(params.mimeTypes.join(','));
    }

    const builder = new gPicker.PickerBuilder()
      .addView(docsView)
      .addView(new gPicker.DocsUploadView())
      .setOAuthToken(params.accessToken)
      .setOrigin(pickerOrigin)
      .setCallback((data: any) => {
        if (data?.action === gPicker.Action.PICKED && Array.isArray(data.docs) && data.docs[0]) {
          const picked = data.docs[0];
          resolve({
            id: picked.id,
            name: picked.name || 'drive-document',
            mimeType: picked.mimeType || 'application/octet-stream',
            sizeBytes: Number(picked.sizeBytes) || undefined,
            url: picked.url || undefined,
          });
        } else if (data?.action === gPicker.Action.CANCEL) {
          resolve(null);
        }
      });

    if (params.title) {
      builder.setTitle(params.title);
    }

    const picker = builder.build();
    picker.setVisible(true);
  });
}

export async function downloadGoogleDriveFileAsFile(params: {
  accessToken: string;
  picked: PickedDriveFile;
}): Promise<File> {
  const { accessToken, picked } = params;
  const isGoogleDoc = picked.mimeType === 'application/vnd.google-apps.document';
  const fetchUrl = isGoogleDoc
    ? `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(picked.id)}/export?mimeType=application/pdf`
    : `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(picked.id)}?alt=media`;

  const response = await fetch(fetchUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      cachedDriveAccessToken = null;
      throw new Error('Google Drive authorization expired or insufficient. Please sign in with Google again.');
    }
    throw new Error(`Failed to fetch file from Google Drive (${response.status}).`);
  }

  const blob = await response.blob();
  const targetMime = isGoogleDoc ? 'application/pdf' : picked.mimeType || blob.type || 'application/octet-stream';
  const targetName =
    isGoogleDoc && !picked.name.toLowerCase().endsWith('.pdf') ? `${picked.name}.pdf` : picked.name;

  return new File([blob], targetName, { type: targetMime });
}
