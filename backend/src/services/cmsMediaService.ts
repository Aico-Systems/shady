import { randomBytes } from 'crypto';
import { access, mkdir, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import { config } from '../config';

const IMAGE_TYPES = new Map<string, string>([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/gif', 'gif'],
]);

const VIDEO_TYPES = new Map<string, string>([
  ['video/mp4', 'mp4'],
  ['video/webm', 'webm'],
  ['video/ogg', 'ogg'],
]);

const CONTENT_TYPE_MAP: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  mp4: 'video/mp4',
  webm: 'video/webm',
  ogg: 'video/ogg',
};

export type CmsMediaKind = 'image' | 'video';

export interface StoredCmsMedia {
  key: string;
  url: string;
  contentType: string;
  kind: CmsMediaKind;
}

function generateKey(kind: CmsMediaKind, uploaderId: string, ext: string): string {
  const timestamp = Date.now();
  const random = randomBytes(8).toString('hex');
  return `cms/${kind}/${uploaderId}/${timestamp}-${random}.${ext}`;
}

function isValidKey(key: string): boolean {
  return (
    key.length > 0 &&
    !key.includes('..') &&
    !key.includes('\0') &&
    !key.startsWith('/')
  );
}

function getAllowedTypes(kind: CmsMediaKind): Map<string, string> {
  return kind === 'image' ? IMAGE_TYPES : VIDEO_TYPES;
}

function toAbsoluteUrl(path: string): string {
  return `${config.BACKEND_URL.replace(/\/$/, '')}${path}`;
}

export function validateCmsMediaFile(
  file: File,
  kind: CmsMediaKind
): { valid: true; ext: string } | { valid: false; error: string } {
  const allowedTypes = getAllowedTypes(kind);
  const ext = allowedTypes.get(file.type);
  if (!ext) {
    return {
      valid: false,
      error:
        kind === 'image'
          ? 'Unsupported image type. Use JPEG, PNG, WebP, or GIF.'
          : 'Unsupported video type. Use MP4, WebM, or Ogg.',
    };
  }

  const maxBytes = config.UPLOAD_MAX_FILE_SIZE_MB * 1024 * 1024;
  if (file.size > maxBytes) {
    return {
      valid: false,
      error: `File too large. Maximum ${config.UPLOAD_MAX_FILE_SIZE_MB}MB.`,
    };
  }

  return { valid: true, ext };
}

export async function storeCmsMedia(
  kind: CmsMediaKind,
  uploaderId: string,
  file: File
): Promise<StoredCmsMedia> {
  const validation = validateCmsMediaFile(file, kind);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const key = generateKey(kind, uploaderId, validation.ext);
  const filePath = join(config.UPLOAD_STORAGE_PATH, key);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, Buffer.from(await file.arrayBuffer()));

  const publicPath = `/api/public/cms/media/${encodeURIComponent(key)}`;
  return {
    key,
    url: toAbsoluteUrl(publicPath),
    contentType: file.type,
    kind,
  };
}

export function resolveCmsMediaPath(key: string): string {
  if (!isValidKey(key)) {
    throw new Error('Invalid media key');
  }
  return join(config.UPLOAD_STORAGE_PATH, key);
}

export function parseCmsMediaKey(encodedKey: string): string {
  let key: string;
  try {
    key = decodeURIComponent(encodedKey);
  } catch {
    throw new Error('Invalid media key');
  }

  if (!isValidKey(key)) {
    throw new Error('Invalid media key');
  }

  return key;
}

export function getCmsMediaContentType(key: string): string {
  const ext = key.split('.').pop()?.toLowerCase() || '';
  return CONTENT_TYPE_MAP[ext] || 'application/octet-stream';
}

export async function cmsMediaExists(key: string): Promise<boolean> {
  try {
    await access(resolveCmsMediaPath(key));
    return true;
  } catch {
    return false;
  }
}
