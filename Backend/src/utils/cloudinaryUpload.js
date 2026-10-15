// Local-disk uploads. Function names kept from the old Cloudinary implementation so callers are untouched.
import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../config/env.js';
import { ApiError } from './ApiError.js';

const DATA_URL_PATTERN = /^data:([^;]+);base64,(.+)$/;

const SAFE_UPLOAD_EXTENSIONS = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/pjpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'application/pdf': 'pdf',
  'video/mp4': 'mp4',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/wav': 'wav',
};

const parseDataUrl = (dataUrl) => {
  const match = String(dataUrl || '').match(DATA_URL_PATTERN);

  if (!match) {
    throw new ApiError(400, 'A valid base64 image data URL is required');
  }

  const mimeType = match[1].toLowerCase();
  const base64 = match[2];
  // Files are served from /uploads on the admin panel's domain: HTML, SVG, XML or script types there could run
  // script in an admin's browser. Only plain pictures, PDFs and media are accepted.
  const extension = SAFE_UPLOAD_EXTENSIONS[mimeType];
  if (!extension) {
    throw new ApiError(400, 'Upload a JPEG, PNG, WebP, GIF or HEIC image, or a PDF');
  }

  return { mimeType, base64, extension };
};

// Only allow safe path segments so a caller-supplied folder can never escape uploadDir.
const safeSegment = (value) => String(value || '').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^\.+/, '') || 'misc';

const saveBuffer = async ({ buffer, folder, publicId, extension }) => {
  const folderParts = String(folder || 'misc').split('/').map(safeSegment);
  const relativeDir = path.posix.join(...folderParts);
  const fileName = `${safeSegment(publicId)}.${extension}`;
  const absoluteDir = path.join(env.uploadDir, ...folderParts);

  await fs.mkdir(absoluteDir, { recursive: true });
  await fs.writeFile(path.join(absoluteDir, fileName), buffer);

  const relativeUrl = `/uploads/${relativeDir}/${fileName}`;
  return {
    secureUrl: `${env.publicBackendUrl.replace(/\/+$/, '')}${relativeUrl}`,
    publicId: `${relativeDir}/${safeSegment(publicId)}`,
    format: extension,
    bytes: buffer.length,
    createdAt: new Date().toISOString(),
    raw: { path: relativeUrl },
  };
};

export const uploadDataUrlToCloudinary = async ({
  dataUrl,
  folder = env.cloudinary.folder,
  publicIdPrefix = 'driver-document',
  publicIdSuffix = '',
}) => {
  const { mimeType, base64, extension } = parseDataUrl(dataUrl);
  const buffer = Buffer.from(base64, 'base64');
  const publicId = `${publicIdPrefix}-${Date.now()}${publicIdSuffix ? `-${publicIdSuffix}` : ''}`;
  const saved = await saveBuffer({ buffer, folder, publicId, extension });
  return {
    ...saved,
    resourceType: mimeType.startsWith('image/') ? 'image' : 'raw',
    width: undefined,
    height: undefined,
    originalFilename: publicId,
  };
};

export const uploadRawFileToCloudinary = async ({
  dataUrl,
  folder = env.cloudinary.folder,
  publicIdPrefix = 'career-resume',
  publicIdSuffix = '',
}) => {
  const { mimeType, base64, extension } = parseDataUrl(dataUrl);
  const buffer = Buffer.from(base64, 'base64');
  const publicId = `${publicIdPrefix}-${Date.now()}${publicIdSuffix ? `-${publicIdSuffix}` : ''}`;
  const saved = await saveBuffer({ buffer, folder, publicId, extension });
  return { ...saved, resourceType: mimeType.startsWith('image/') ? 'image' : 'raw' };
};
