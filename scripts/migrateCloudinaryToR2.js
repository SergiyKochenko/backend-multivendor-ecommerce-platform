require("dotenv").config();

const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const mongoose = require("mongoose");
const { dbConnect } = require("../utiles/db");
const adminModel = require("../models/adminModel");
const authOrderModel = require("../models/authOrder");
const bannerModel = require("../models/bannerModel");
const categoryModel = require("../models/categoryModel");
const customerOrderModel = require("../models/customerOrder");
const productModel = require("../models/productModel");
const sellerCustomerModel = require("../models/chat/sellerCustomerModel");
const sellerModel = require("../models/sellerModel");
const wishlistModel = require("../models/wishlistModel");
const {
  getPublicUrl,
  getR2ObjectMetadata,
  hasR2Configuration,
  uploadBufferToR2,
} = require("../services/mediaStorage");

const failureLog = path.join(__dirname, "cloudinary-migration-failures.jsonl");
const runId = new Date().toISOString();
const migratedUrls = new Map();
const failedUrls = new Map();
const dryRun = process.argv.includes("--dry-run");

if (process.argv.includes("--production")) {
  process.env.mode = "pro";
}

const migrationTargets = [
  [adminModel, "image"],
  [sellerModel, "image"],
  [productModel, "images"],
  [categoryModel, "image"],
  [bannerModel, "banner"],
  [wishlistModel, "image"],
  [customerOrderModel, "products"],
  [authOrderModel, "products"],
  [sellerCustomerModel, "myFriends"],
];

const isCloudinaryUrl = (url) =>
  typeof url === "string" && url.includes("res.cloudinary.com/");

const canonicalizeUrl = (url) => {
  const parsedUrl = new URL(url);
  parsedUrl.hash = "";
  parsedUrl.search = "";
  return parsedUrl.toString();
};

const getMigrationKey = (url) => {
  const hash = crypto
    .createHash("sha256")
    .update(canonicalizeUrl(url))
    .digest("hex");
  return `migrated/${hash}`;
};

const getObjectMetadataOrNull = async (key) => {
  try {
    return await getR2ObjectMetadata(key);
  } catch (error) {
    if (
      error?.$metadata?.httpStatusCode === 404 ||
      error?.name === "NotFound" ||
      error?.name === "NoSuchKey"
    ) {
      return null;
    }
    throw error;
  }
};

const verifyPublicUrl = async (url) => {
  const response = await fetch(url, {
    method: "HEAD",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`R2 public URL verification failed with HTTP ${response.status}`);
  }
};

const migrateUrl = async (url) => {
  if (!isCloudinaryUrl(url)) return url;

  const canonicalUrl = canonicalizeUrl(url);
  if (migratedUrls.has(canonicalUrl)) return migratedUrls.get(canonicalUrl);
  if (failedUrls.has(canonicalUrl)) throw failedUrls.get(canonicalUrl);

  try {
    const key = getMigrationKey(url);
    let metadata = await getObjectMetadataOrNull(key);

    if (!metadata || Number(metadata.ContentLength) <= 0) {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) {
        throw new Error(`Cloudinary download failed with HTTP ${response.status}`);
      }

      const contentType =
        response.headers.get("content-type")?.split(";")[0]?.trim() ||
        "application/octet-stream";
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length === 0) {
        throw new Error("Cloudinary download returned an empty file");
      }

      if (!dryRun) {
        await uploadBufferToR2(buffer, key, contentType);
        metadata = await getR2ObjectMetadata(key);
        if (Number(metadata.ContentLength) !== buffer.length) {
          throw new Error(
            `R2 size verification failed: expected ${buffer.length}, received ${metadata.ContentLength}`,
          );
        }
      }
    }

    const migratedUrl = getPublicUrl(key);
    if (!dryRun) await verifyPublicUrl(migratedUrl);
    migratedUrls.set(canonicalUrl, migratedUrl);
    return migratedUrl;
  } catch (error) {
    failedUrls.set(canonicalUrl, error);
    throw error;
  }
};

const recordFailure = async ({ collection, documentId, field, url, error }) => {
  await fs.appendFile(
    failureLog,
    `${JSON.stringify({
      runId,
      collection,
      documentId: String(documentId),
      field,
      url,
      error: error.message,
    })}\n`,
  );
};

const migrateValue = async (value, context, fieldPath) => {
  if (typeof value === "string") {
    if (!isCloudinaryUrl(value)) return { value, references: 0, failures: 0 };

    try {
      return {
        value: await migrateUrl(value),
        references: 1,
        failures: 0,
      };
    } catch (error) {
      await recordFailure({
        ...context,
        field: fieldPath,
        url: value,
        error,
      });
      return { value, references: 0, failures: 1 };
    }
  }

  if (Array.isArray(value)) {
    const migratedArray = [];
    let references = 0;
    let failures = 0;
    for (let index = 0; index < value.length; index += 1) {
      const result = await migrateValue(
        value[index],
        context,
        `${fieldPath}[${index}]`,
      );
      migratedArray.push(result.value);
      references += result.references;
      failures += result.failures;
    }
    return { value: migratedArray, references, failures };
  }

  if (
    value &&
    typeof value === "object" &&
    !(value instanceof Date) &&
    !Buffer.isBuffer(value) &&
    !value._bsontype
  ) {
    const migratedObject = {};
    let references = 0;
    let failures = 0;
    for (const [key, nestedValue] of Object.entries(value)) {
      const result = await migrateValue(
        nestedValue,
        context,
        `${fieldPath}.${key}`,
      );
      migratedObject[key] = result.value;
      references += result.references;
      failures += result.failures;
    }
    return { value: migratedObject, references, failures };
  }

  return { value, references: 0, failures: 0 };
};

const migrateCollectionField = async (model, field) => {
  const result = {
    collection: model.collection.name,
    field,
    documents: 0,
    references: 0,
    failures: 0,
  };
  const cursor = model.find({}).lean().cursor();

  for await (const document of cursor) {
    const migrated = await migrateValue(
      document[field],
      {
        collection: model.collection.name,
        documentId: document._id,
      },
      field,
    );
    result.failures += migrated.failures;

    if (migrated.references > 0) {
      if (dryRun) {
        result.documents += 1;
        result.references += migrated.references;
      } else {
        try {
          const updateResult = await model.updateOne(
            { _id: document._id },
            { $set: { [field]: migrated.value } },
          );
          if (updateResult.matchedCount !== 1) {
            throw new Error("Document was not found during the database update");
          }
          result.documents += 1;
          result.references += migrated.references;
        } catch (error) {
          result.failures += 1;
          await recordFailure({
            collection: model.collection.name,
            documentId: document._id,
            field,
            url: "n/a",
            error,
          });
        }
      }
    }
  }

  return result;
};

const main = async () => {
  if (!hasR2Configuration()) {
    throw new Error("All CLOUDFLARE_R2_* variables must be configured before migrating");
  }

  await dbConnect();
  if (mongoose.connection.readyState !== 1) {
    throw new Error("MongoDB connection was not established");
  }

  const results = [];
  for (const [model, field] of migrationTargets) {
    results.push(await migrateCollectionField(model, field));
  }

  const totals = results.reduce(
    (summary, result) => ({
      documents: summary.documents + result.documents,
      references: summary.references + result.references,
      failures: summary.failures + result.failures,
    }),
    { documents: 0, references: 0, failures: 0 },
  );

  console.log(
    JSON.stringify({
      runId,
      dryRun,
      results,
      totals,
      uniqueMedia: migratedUrls.size,
    }),
  );

  if (totals.failures > 0) process.exitCode = 2;
};

main()
  .catch(async (error) => {
    await recordFailure({
      collection: "migration",
      documentId: "n/a",
      field: "n/a",
      url: "n/a",
      error,
    });
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) await mongoose.connection.close();
  });
