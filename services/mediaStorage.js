const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} = require("@aws-sdk/client-s3");
const cloudinary = require("cloudinary").v2;

const requiredR2Variables = [
  "CLOUDFLARE_R2_ACCOUNT_ID",
  "CLOUDFLARE_R2_ACCESS_KEY_ID",
  "CLOUDFLARE_R2_SECRET_ACCESS_KEY",
  "CLOUDFLARE_R2_BUCKET",
  "CLOUDFLARE_R2_PUBLIC_URL",
];

const hasR2Configuration = () =>
  requiredR2Variables.every((name) => Boolean(process.env[name]?.trim()));

const hasCloudinaryConfiguration = () =>
  Boolean(process.env.cloud_name?.trim() && process.env.api_key?.trim() && process.env.api_secret?.trim());

const getMediaStorageProvider = () =>
  (process.env.MEDIA_STORAGE || (hasR2Configuration() ? "r2" : "cloudinary")).trim().toLowerCase();

const getR2Client = () => {
  if (!hasR2Configuration()) {
    throw new Error(
      `Missing Cloudflare R2 configuration: ${requiredR2Variables.join(", ")}`,
    );
  }

  return new S3Client({
    region: "auto",
    endpoint: `https://${process.env.CLOUDFLARE_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
    },
  });
};

const encodeKeyForUrl = (key) =>
  key
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

const getPublicUrl = (key) => {
  if (!process.env.CLOUDFLARE_R2_PUBLIC_URL) {
    throw new Error("Missing Cloudflare R2 public URL");
  }

  return `${process.env.CLOUDFLARE_R2_PUBLIC_URL.replace(/\/$/, "")}/${encodeKeyForUrl(key)}`;
};

const getR2Key = (url) => {
  if (!url || !process.env.CLOUDFLARE_R2_PUBLIC_URL) return null;

  try {
    const publicUrl = new URL(
      `${process.env.CLOUDFLARE_R2_PUBLIC_URL.replace(/\/$/, "")}/`,
    );
    const mediaUrl = new URL(url);
    if (mediaUrl.origin !== publicUrl.origin) return null;

    const basePath = publicUrl.pathname;
    if (!mediaUrl.pathname.startsWith(basePath)) return null;

    const encodedKey = mediaUrl.pathname.slice(basePath.length);
    if (!encodedKey) return null;
    return encodedKey
      .split("/")
      .map((segment) => decodeURIComponent(segment))
      .join("/");
  } catch {
    return null;
  }
};

const getCloudinaryPublicId = (url) => {
  if (!url || !url.includes("res.cloudinary.com/")) return null;
  const withoutQuery = url.split("?")[0];
  const uploadIndex = withoutQuery.indexOf("/upload/");
  if (uploadIndex < 0) return null;
  let publicId = withoutQuery.slice(uploadIndex + "/upload/".length);
  publicId = publicId.replace(/^v\d+\//, "");
  return publicId.replace(path.extname(publicId), "");
};

const configureCloudinary = () => {
  cloudinary.config({
    cloud_name: process.env.cloud_name,
    api_key: process.env.api_key,
    api_secret: process.env.api_secret,
    secure: true,
  });
};

const uploadToR2 = async (file, key) => {
  const client = getR2Client();
  await client.send(
    new PutObjectCommand({
      Bucket: process.env.CLOUDFLARE_R2_BUCKET,
      Key: key,
      Body: fs.createReadStream(file.filepath),
      ContentType: file.mimetype || "application/octet-stream",
    }),
  );
  return { url: getPublicUrl(key), key, provider: "r2" };
};

const uploadToCloudinary = async (file, folder) => {
  configureCloudinary();
  const result = await cloudinary.uploader.upload(file.filepath, { folder });
  return {
    url: result.secure_url || result.url,
    key: result.public_id,
    provider: "cloudinary",
  };
};

const uploadMedia = async (file, folder, key) => {
  const provider = getMediaStorageProvider();
  if (provider === "r2") {
    if (!hasR2Configuration()) {
      if (hasCloudinaryConfiguration()) {
        return uploadToCloudinary(file, folder);
      }
      throw new Error(
        "Cloudflare R2 is not configured. Set CLOUDFLARE_R2_* vars or select MEDIA_STORAGE=cloudinary.",
      );
    }
    return uploadToR2(file, key);
  }
  if (provider === "cloudinary") {
    if (!hasCloudinaryConfiguration()) {
      throw new Error("Cloudinary is not configured. Set cloud_name, api_key, and api_secret.");
    }
    return uploadToCloudinary(file, folder);
  }
  throw new Error(`Unsupported MEDIA_STORAGE provider: ${provider}`);
};

const createMediaKey = (folder, ownerId, file) => {
  const candidateExtension = path
    .extname(file?.originalFilename || "")
    .toLowerCase();
  const extension = /^\.[a-z0-9]{1,10}$/.test(candidateExtension)
    ? candidateExtension
    : "";
  return `${folder}/${ownerId}/${crypto.randomUUID()}${extension}`;
};

const deleteMedia = async (url) => {
  const r2Key = getR2Key(url);
  if (r2Key) {
    await getR2Client().send(
      new DeleteObjectCommand({
        Bucket: process.env.CLOUDFLARE_R2_BUCKET,
        Key: r2Key,
      }),
    );
    return { deleted: true, provider: "r2", key: r2Key };
  }

  const publicId = getCloudinaryPublicId(url);
  if (
    getMediaStorageProvider() === "cloudinary" &&
    publicId &&
    process.env.cloud_name &&
    process.env.api_key &&
    process.env.api_secret
  ) {
    configureCloudinary();
    await cloudinary.uploader.destroy(publicId);
    return { deleted: true, provider: "cloudinary", key: publicId };
  }

  return { deleted: false, provider: null, key: null };
};

const uploadBufferToR2 = async (buffer, key, contentType) => {
  const client = getR2Client();
  await client.send(
    new PutObjectCommand({
      Bucket: process.env.CLOUDFLARE_R2_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType || "application/octet-stream",
    }),
  );
  return { url: getPublicUrl(key), key, provider: "r2" };
};

const r2ObjectExists = async (key) => {
  try {
    await getR2Client().send(
      new HeadObjectCommand({
        Bucket: process.env.CLOUDFLARE_R2_BUCKET,
        Key: key,
      }),
    );
    return true;
  } catch (error) {
    if (error?.$metadata?.httpStatusCode === 404 || error?.name === "NotFound") {
      return false;
    }
    throw error;
  }
};

const getR2ObjectMetadata = async (key) =>
  getR2Client().send(
    new HeadObjectCommand({
      Bucket: process.env.CLOUDFLARE_R2_BUCKET,
      Key: key,
    }),
  );

module.exports = {
  createMediaKey,
  deleteMedia,
  getCloudinaryPublicId,
  getMediaStorageProvider,
  getPublicUrl,
  getR2Key,
  getR2ObjectMetadata,
  hasR2Configuration,
  r2ObjectExists,
  uploadBufferToR2,
  uploadMedia,
};
