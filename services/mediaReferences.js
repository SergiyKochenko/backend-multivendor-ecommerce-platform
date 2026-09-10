const mongoose = require("mongoose");
const { deleteMedia } = require("./mediaStorage");

// Shown in historical orders in place of a product image that has been permanently deleted from Cloudflare R2.
const REMOVED_PRODUCT_IMAGE_PLACEHOLDER = "/images/error.png";

const referenceQueries = [
  ["admins", (url) => ({ image: url })],
  ["sellers", (url) => ({ image: url })],
  ["products", (url) => ({ images: url })],
  ["categorys", (url) => ({ image: url })],
  ["banners", (url) => ({ banner: url })],
  ["wishlists", (url) => ({ image: url })],
  ["customerorders", (url) => ({ "products.images": url })],
  ["authororders", (url) => ({ "products.images": url })],
  ["seller_customers", (url) => ({ "myFriends.image": url })],
];

const orderImageCollections = ["customerorders", "authororders"];

const isMediaReferenced = async (url) => {
  if (!url || mongoose.connection.readyState !== 1) return true;

  for (const [collectionName, createQuery] of referenceQueries) {
    const reference = await mongoose.connection.db
      .collection(collectionName)
      .findOne(createQuery(url), { projection: { _id: 1 } });
    if (reference) return true;
  }

  return false;
};

const deleteMediaIfUnreferenced = async (url) => {
  if (await isMediaReferenced(url)) {
    return { deleted: false, reason: "referenced" };
  }

  return deleteMedia(url);
};

// Swaps a deleted product's image for a placeholder inside past orders, so order history keeps rendering.
const replaceOrderImageReferences = async (
  url,
  placeholderUrl = REMOVED_PRODUCT_IMAGE_PLACEHOLDER,
) => {
  if (!url || mongoose.connection.readyState !== 1) return;

  for (const collectionName of orderImageCollections) {
    await mongoose.connection.db.collection(collectionName).updateMany(
      { "products.images": url },
      { $set: { "products.$[prod].images.$[img]": placeholderUrl } },
      { arrayFilters: [{ "prod.images": url }, { img: url }] },
    );
  }
};

// Replaces the image in any past order snapshots, then permanently deletes it from Cloudflare R2.
const deleteMediaAndPreserveOrderHistory = async (
  url,
  placeholderUrl = REMOVED_PRODUCT_IMAGE_PLACEHOLDER,
) => {
  await replaceOrderImageReferences(url, placeholderUrl);
  return deleteMedia(url);
};


module.exports = {
  deleteMediaIfUnreferenced,
  isMediaReferenced,
  referenceQueries,
  replaceOrderImageReferences,
  deleteMediaAndPreserveOrderHistory,
  REMOVED_PRODUCT_IMAGE_PLACEHOLDER,
};
