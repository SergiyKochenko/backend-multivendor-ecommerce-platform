const mongoose = require("mongoose");
const { deleteMedia } = require("./mediaStorage");

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

module.exports = {
  deleteMediaIfUnreferenced,
  isMediaReferenced,
  referenceQueries,
};
