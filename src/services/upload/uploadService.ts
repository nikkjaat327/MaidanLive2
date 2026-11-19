import { ADMIN_TOKEN_KEY, CUSTOMER_TOKEN_KEY } from '../api/httpClient.ts';

export type UploadFolder =
  | 'teams'
  | 'players'
  | 'tournaments'
  | 'sponsors'
  | 'streams'
  | 'avatars'
  | 'general';

export interface UploadedFileResponse {
  url: string;
  publicId: string;
  asset: {
    id: string;
    url: string;
    publicId: string;
    originalName: string;
    mimeType: string;
    format: string;
    resourceType: string;
    folder: string;
    bytes: number;
  };
}

export const uploadService = {
  async uploadFile(
    file: File,
    options: { folder?: UploadFolder; portal?: 'admin' | 'customer' } = {}
  ): Promise<UploadedFileResponse> {
    const portal = options.portal || 'admin';
    const primaryKey = portal === 'customer' ? CUSTOMER_TOKEN_KEY : ADMIN_TOKEN_KEY;
    const secondaryKey = portal === 'customer' ? ADMIN_TOKEN_KEY : CUSTOMER_TOKEN_KEY;
    const token =
      typeof window !== 'undefined'
        ? window.localStorage.getItem(primaryKey) || window.localStorage.getItem(secondaryKey)
        : null;

    if (!token) {
      throw new Error('Please sign in before uploading files.');
    }

    const formData = new FormData();
    formData.append('file', file);
    if (options.folder) {
      formData.append('folder', options.folder);
    }

    const res = await fetch('/api/uploads', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(
        typeof data?.message === 'string' && data.message.trim()
          ? data.message
          : `Upload failed with status ${res.status}.`
      );
    }

    return data as UploadedFileResponse;
  },
};
