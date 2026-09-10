const mongoose = require("mongoose");

jest.mock("../services/mediaStorage", () => ({
  deleteMedia: jest.fn(),
}));

const { deleteMedia } = require("../services/mediaStorage");
const {
  isMediaReferenced,
  deleteMediaIfUnreferenced,
  replaceOrderImageReferences,
  deleteMediaAndPreserveOrderHistory,
  REMOVED_PRODUCT_IMAGE_PLACEHOLDER,
} = require("../services/mediaReferences");

describe("mediaReferences", () => {
  let mockCollection;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCollection = { findOne: jest.fn().mockResolvedValue(null), updateMany: jest.fn().mockResolvedValue({}) };
    Object.defineProperty(mongoose.connection, "readyState", { value: 1, configurable: true });
    mongoose.connection.db = { collection: jest.fn(() => mockCollection) };
  });

  test("isMediaReferenced returns true when disconnected", async () => {
    Object.defineProperty(mongoose.connection, "readyState", { value: 0, configurable: true });
    await expect(isMediaReferenced("https://media.example.com/a.png")).resolves.toBe(true);
  });

  test("isMediaReferenced returns false when no collection has a match", async () => {
    await expect(isMediaReferenced("https://media.example.com/a.png")).resolves.toBe(false);
  });

  test("isMediaReferenced returns true when a collection has a match", async () => {
    mockCollection.findOne.mockResolvedValueOnce({ _id: "1" });
    await expect(isMediaReferenced("https://media.example.com/a.png")).resolves.toBe(true);
  });

  test("deleteMediaIfUnreferenced skips deletion when referenced", async () => {
    mockCollection.findOne.mockResolvedValueOnce({ _id: "1" });
    const result = await deleteMediaIfUnreferenced("https://media.example.com/a.png");
    expect(result).toEqual({ deleted: false, reason: "referenced" });
    expect(deleteMedia).not.toHaveBeenCalled();
  });

  test("deleteMediaIfUnreferenced deletes when unreferenced", async () => {
    deleteMedia.mockResolvedValueOnce({ deleted: true });
    const result = await deleteMediaIfUnreferenced("https://media.example.com/a.png");
    expect(deleteMedia).toHaveBeenCalledWith("https://media.example.com/a.png");
    expect(result).toEqual({ deleted: true });
  });

  test("replaceOrderImageReferences swaps the image for a placeholder in both order collections", async () => {
    const url = "https://media.example.com/a.png";
    await replaceOrderImageReferences(url);

    expect(mongoose.connection.db.collection).toHaveBeenCalledWith("customerorders");
    expect(mongoose.connection.db.collection).toHaveBeenCalledWith("authororders");
    expect(mockCollection.updateMany).toHaveBeenCalledWith(
      { "products.images": url },
      { $set: { "products.$[prod].images.$[img]": REMOVED_PRODUCT_IMAGE_PLACEHOLDER } },
      { arrayFilters: [{ "prod.images": url }, { img: url }] },
    );
    expect(mockCollection.updateMany).toHaveBeenCalledTimes(2);
  });

  test("replaceOrderImageReferences is a no-op when disconnected", async () => {
    Object.defineProperty(mongoose.connection, "readyState", { value: 0, configurable: true });
    await replaceOrderImageReferences("https://media.example.com/a.png");
    expect(mockCollection.updateMany).not.toHaveBeenCalled();
  });

  test("deleteMediaAndPreserveOrderHistory replaces order references then force-deletes the media", async () => {
    deleteMedia.mockResolvedValueOnce({ deleted: true, provider: "r2" });
    const url = "https://media.example.com/a.png";

    const result = await deleteMediaAndPreserveOrderHistory(url);

    expect(mockCollection.updateMany).toHaveBeenCalledTimes(2);
    expect(deleteMedia).toHaveBeenCalledWith(url);
    expect(result).toEqual({ deleted: true, provider: "r2" });
  });
});
