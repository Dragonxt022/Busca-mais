const fs = require('fs/promises');
const path = require('path');
const sharp = require('sharp');
const { randomUUID } = require('crypto');

const UPLOAD_ROOT = path.resolve(__dirname, '../../uploads/sponsors');
const UPLOAD_ROUTE_PREFIX = '/uploads/sponsors';
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_COUNT = 5;

function ensureArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null || value === '') return [];
  return [value];
}

function sanitizeSegment(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'sponsor';
}

function isManagedUploadUrl(value) {
  return String(value || '').startsWith(`${UPLOAD_ROUTE_PREFIX}/`);
}

function toRelativeUploadPath(value) {
  if (!isManagedUploadUrl(value)) {
    return null;
  }

  return value.replace(`${UPLOAD_ROUTE_PREFIX}/`, '').replace(/\//g, path.sep);
}

function normalizeStoredImage(entry) {
  if (!entry) return null;

  if (typeof entry === 'string') {
    return {
      url: entry,
      thumbnailUrl: entry,
    };
  }

  const url = String(entry.url || entry.path || '').trim();
  const thumbnailUrl = String(entry.thumbnailUrl || entry.thumbnail_path || url).trim();

  if (!url) return null;

  return {
    url,
    thumbnailUrl: thumbnailUrl || url,
  };
}

function parseStoredSponsorImages(raw) {
  if (!raw) return [];

  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeStoredImage).filter(Boolean);
  } catch {
    return [];
  }
}

function serializeStoredSponsorImages(images) {
  return JSON.stringify(images.map((image) => ({
    url: image.url,
    thumbnailUrl: image.thumbnailUrl,
  })));
}

async function ensureUploadDir(sponsorScope) {
  const targetDir = path.join(UPLOAD_ROOT, sponsorScope);
  await fs.mkdir(targetDir, { recursive: true });
  return targetDir;
}

async function saveImageVariants(file, sponsorScope) {
  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    throw new Error('Formato de imagem invalido. Use JPG, PNG ou WEBP.');
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error('Imagem excede o limite de 5MB.');
  }

  const uploadDir = await ensureUploadDir(sponsorScope);
  const fileId = randomUUID();
  const baseName = `${sanitizeSegment(file.originalname)}-${fileId}`;
  const imageFilename = `${baseName}.webp`;
  const thumbnailFilename = `${baseName}-thumb.webp`;
  const imagePath = path.join(uploadDir, imageFilename);
  const thumbnailPath = path.join(uploadDir, thumbnailFilename);

  const imagePipeline = sharp(file.buffer).rotate();

  await imagePipeline
    .clone()
    .resize({ width: 1400, height: 1400, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toFile(imagePath);

  await imagePipeline
    .clone()
    .resize({ width: 320, height: 240, fit: 'cover', position: 'centre' })
    .webp({ quality: 76 })
    .toFile(thumbnailPath);

  const sponsorRoute = `${UPLOAD_ROUTE_PREFIX}/${sponsorScope}`;

  return {
    url: `${sponsorRoute}/${imageFilename}`,
    thumbnailUrl: `${sponsorRoute}/${thumbnailFilename}`,
  };
}

async function deleteManagedSponsorImages(images) {
  const normalizedImages = Array.isArray(images) ? images : [];

  await Promise.all(normalizedImages.flatMap((image) => {
    const normalized = normalizeStoredImage(image);
    if (!normalized) return [];

    return [normalized.url, normalized.thumbnailUrl]
      .map(toRelativeUploadPath)
      .filter(Boolean)
      .map(async (relativePath) => {
        const absolutePath = path.join(UPLOAD_ROOT, relativePath);
        try {
          await fs.unlink(absolutePath);
        } catch {
          return null;
        }
        return null;
      });
  }));
}

async function resolveSponsorImages({
  sponsorId = null,
  sponsorName = '',
  existingImages = [],
  files = [],
}) {
  const retainedImages = ensureArray(existingImages)
    .map((item) => {
      if (typeof item === 'string') {
        try {
          return normalizeStoredImage(JSON.parse(item));
        } catch {
          return normalizeStoredImage(item);
        }
      }

      return normalizeStoredImage(item);
    })
    .filter(Boolean);

  const totalCount = retainedImages.length + ensureArray(files).length;
  if (totalCount > MAX_IMAGE_COUNT) {
    throw new Error(`Limite maximo de ${MAX_IMAGE_COUNT} imagens por patrocinio.`);
  }

  const sponsorScope = sponsorId
    ? String(sponsorId)
    : `pending-${sanitizeSegment(sponsorName)}-${Date.now()}`;

  const uploadedImages = [];
  for (const file of ensureArray(files)) {
    uploadedImages.push(await saveImageVariants(file, sponsorScope));
  }

  return [...retainedImages, ...uploadedImages];
}

module.exports = {
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE_BYTES,
  MAX_IMAGE_COUNT,
  UPLOAD_ROOT,
  UPLOAD_ROUTE_PREFIX,
  deleteManagedSponsorImages,
  isManagedUploadUrl,
  parseStoredSponsorImages,
  resolveSponsorImages,
  serializeStoredSponsorImages,
};
