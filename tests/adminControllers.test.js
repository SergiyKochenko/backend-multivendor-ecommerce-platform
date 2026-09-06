const mockFormidable = jest.fn();

jest.mock("formidable", () => mockFormidable);

const mockCloudinary = {
  config: jest.fn(),
  uploader: {
    upload: jest.fn(),
    destroy: jest.fn(),
  },
};

jest.mock("cloudinary", () => ({
  v2: mockCloudinary,
}));

jest.mock("../models/categoryModel", () => ({
  create: jest.fn(),
  find: jest.fn(),
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  findByIdAndDelete: jest.fn(),
}));
jest.mock("../models/productModel", () => ({
  create: jest.fn(),
  find: jest.fn(),
  findOne: jest.fn(),
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  deleteOne: jest.fn(),
}));
jest.mock("../models/bannerModel", () => ({
  create: jest.fn(),
  findOne: jest.fn(),
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  aggregate: jest.fn(),
}));
jest.mock("../models/myShopWallet", () => ({
  aggregate: jest.fn(),
}));
jest.mock("../models/customerOrder", () => ({
  aggregate: jest.fn(),
  find: jest.fn(),
}));
jest.mock("../models/sellerModel", () => ({
  aggregate: jest.fn(),
  find: jest.fn(),
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
}));
jest.mock("../models/chat/adminSellerMessage", () => ({
  find: jest.fn(),
  create: jest.fn(),
}));
jest.mock("../models/sellerWallet", () => ({
  aggregate: jest.fn(),
}));
jest.mock("../models/authOrder", () => ({
  aggregate: jest.fn(),
  find: jest.fn(),
}));
jest.mock("../models/chat/sellerCustomerMessage", () => ({
  find: jest.fn(),
}));

const categoryModel = require("../models/categoryModel");
const productModel = require("../models/productModel");
const bannerModel = require("../models/bannerModel");
const myShopWallet = require("../models/myShopWallet");
const customerOrder = require("../models/customerOrder");
const sellerModel = require("../models/sellerModel");
const adminSellerMessage = require("../models/chat/adminSellerMessage");
const sellerWallet = require("../models/sellerWallet");
const authOrder = require("../models/authOrder");
const sellerCustomerMessage = require("../models/chat/sellerCustomerMessage");
const categoryController = require("../controllers/dashboard/categoryController");
const productController = require("../controllers/dashboard/productController");
const dashboardController = require("../controllers/dashboard/dashboardController");
const sellerController = require("../controllers/dashboard/sellerController");
const { createRes, createQueryChain, createAggregateChain } = require("./testHelpers");

const mockParse = (fields, files, err = null) => {
  mockFormidable.mockReturnValue({
    parse: jest.fn((req, callback) => callback(err, fields, files)),
  });
};

describe("dashboard and catalog controllers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.cloud_name = "cloud";
    process.env.api_key = "key";
    process.env.api_secret = "secret";
  });

  test("adds, lists, updates, and deletes categories", async () => {
    mockParse({ name: " Phones " }, { image: { filepath: "/tmp/cat.png" } });
    mockCloudinary.uploader.upload.mockResolvedValue({ url: "https://cdn.example/cat.png" });
    categoryModel.create.mockResolvedValue({ id: "category-1" });

    await categoryController.add_category({}, createRes());

    categoryModel.find.mockReturnValue(createQueryChain([{ name: "Phones" }]));
    categoryModel.find.mockReturnValueOnce(createQueryChain([{ name: "Phones" }], { countDocuments: jest.fn().mockResolvedValue(1) }));
    const listRes = createRes();
    await categoryController.get_category({ query: { page: "1", parPage: "10", searchValue: "phones" } }, listRes);

    mockParse({ name: " Updated Phones " }, {}, null);
    categoryModel.findById.mockResolvedValue({ image: "old-category.png" });
    categoryModel.findByIdAndUpdate.mockResolvedValue({ id: "category-1" });
    const updateRes = createRes();
    await categoryController.update_category({ params: { id: "category-1" } }, updateRes);

    categoryModel.findByIdAndDelete.mockResolvedValue({ id: "category-1" });
    const deleteRes = createRes();
    await categoryController.deleteCategory({ params: { id: "category-1" } }, deleteRes);

    expect(listRes.status).toHaveBeenCalledWith(200);
    expect(updateRes.status).toHaveBeenCalledWith(200);
    expect(deleteRes.status).toHaveBeenCalledWith(200);
  });

  test("covers category error and fallback branches", async () => {
    mockParse({}, {}, new Error("parse error"));
    const parseErrRes = createRes();
    await categoryController.add_category({}, parseErrRes);

    categoryModel.find
      .mockReturnValueOnce(createQueryChain([{ name: "A" }], { countDocuments: jest.fn().mockResolvedValue(1) }))
      .mockReturnValueOnce(createQueryChain([{ name: "B" }], { countDocuments: jest.fn().mockResolvedValue(1) }));
    const emptySearchRes = createRes();
    await categoryController.get_category({ query: { page: "1", parPage: "10", searchValue: "" } }, emptySearchRes);

    const fallbackRes = createRes();
    await categoryController.get_category({ query: {} }, fallbackRes);

    mockParse({ name: " Phones " }, { image: { filepath: "/tmp/image.png" } });
    mockCloudinary.uploader.upload.mockResolvedValue({ url: "https://cdn.example/image.png" });
    categoryModel.findById.mockResolvedValue({ image: "old-category.png" });
    categoryModel.findByIdAndUpdate.mockResolvedValue({ id: "category-1" });
    const withImageRes = createRes();
    await categoryController.update_category({ params: { id: "category-1" } }, withImageRes);
    await new Promise((resolve) => setImmediate(resolve));

    categoryModel.findByIdAndDelete.mockResolvedValue(null);
    const notFoundRes = createRes();
    await categoryController.deleteCategory({ params: { id: "category-missing" } }, notFoundRes);

    expect(parseErrRes.status).toHaveBeenCalledWith(404);
    expect(emptySearchRes.status).toHaveBeenCalledWith(200);
    expect(fallbackRes.status).toHaveBeenCalledWith(200);
    expect(withImageRes.status).toHaveBeenCalledWith(200);
    expect(notFoundRes.status).toHaveBeenCalledWith(404);
  });

  test("adds, queries, updates, and deletes products", async () => {
    mockParse(
      {
        name: " Phone ",
        category: " Phones ",
        description: " Great phone ",
        stock: "10",
        price: "500",
        discount: "10",
        shopName: "Shop",
        brand: "Brand",
      },
      { images: [{ filepath: "/tmp/a.png" }, { filepath: "/tmp/b.png" }] },
    );
    mockCloudinary.uploader.upload.mockResolvedValue({ url: "https://cdn.example/product.png" });
    productModel.create.mockResolvedValue({ id: "product-1" });
    sellerModel.findById.mockResolvedValue({ shopInfo: { shopName: "Shop" } });

    await productController.add_product({ id: "seller-1" }, createRes());

    productModel.find
      .mockReturnValueOnce(createQueryChain([{ id: 1 }]))
      .mockReturnValueOnce(createQueryChain([{ id: 2 }], { countDocuments: jest.fn().mockResolvedValue(1) }));
    const listRes = createRes();
    await productController.products_get({ id: "seller-1", query: { page: "1", parPage: "10", searchValue: "phone" } }, listRes);

    productModel.findById.mockResolvedValueOnce({ id: "product-1" });
    const getRes = createRes();
    await productController.product_get({ params: { productId: "product-1" } }, getRes);

    productModel.findByIdAndUpdate.mockResolvedValue({});
    const updateRes = createRes();
    await productController.product_update({ body: { name: "Updated Phone", description: "Updated", stock: 9, price: 450, category: "phones", discount: 5, brand: "Brand", productId: "product-1" } }, updateRes);

    productModel.findOne
      .mockResolvedValueOnce({ id: "product-1", images: [] })
      .mockResolvedValueOnce({ images: ["old.png"] })
      .mockResolvedValueOnce({ images: ["old.png"] });
    productModel.deleteOne.mockResolvedValue({});
    const deleteRes = createRes();
    await productController.delete_product({ params: { productId: "product-1" }, id: "seller-1" }, deleteRes);

    mockParse({ oldImage: "old.png", productId: "product-1" }, { newImage: { filepath: "/tmp/new.png" } });
    productModel.findById.mockResolvedValueOnce({ id: "product-1" });
    const imageRes = createRes();
    await productController.product_image_update({}, imageRes);
    await new Promise((resolve) => setImmediate(resolve));

    mockParse({ productId: "product-1", addImage: "true" }, { newImage: { filepath: "/tmp/add.png" } });
    productModel.findById.mockResolvedValueOnce({
      id: "product-1",
      images: ["old.png", "https://cdn.example/product.png"],
    });
    const addImageRes = createRes();
    await productController.product_image_update({}, addImageRes);
    await new Promise((resolve) => setImmediate(resolve));

    expect(listRes.status).toHaveBeenCalledWith(200);
    expect(getRes.status).toHaveBeenCalledWith(200);
    expect(updateRes.status).toHaveBeenCalledWith(200);
    expect(deleteRes.status).toHaveBeenCalledWith(200);
    expect(imageRes.status).toHaveBeenCalledWith(200);
    expect(addImageRes.status).toHaveBeenCalledWith(200);
  });

  test("covers product alternate branches", async () => {
    productModel.find
      .mockReturnValueOnce(createQueryChain([{ id: 1 }]))
      .mockReturnValueOnce({ countDocuments: jest.fn().mockResolvedValue(1) });
    const defaultListRes = createRes();
    await productController.products_get({ id: "seller-1", query: { page: "1", parPage: "10" } }, defaultListRes);

    productModel.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ images: ["old.png"] })
      .mockResolvedValueOnce({ images: ["old.png"] })
      .mockResolvedValueOnce({ images: ["old.png", "keep.png"] })
      .mockResolvedValueOnce({ images: ["old.png"] });
    const unauthorizedDeleteRes = createRes();
    await productController.delete_product({ params: { productId: "p1" }, id: "seller-1" }, unauthorizedDeleteRes);

    mockParse({}, {}, new Error("parse failed"));
    const parseErrRes = createRes();
    await productController.product_image_update({}, parseErrRes);

    mockParse({ oldImage: "old.png", productId: "product-1" }, { newImage: { filepath: "/tmp/new.png" } });
    mockCloudinary.uploader.upload.mockResolvedValue(null);
    const uploadFailRes = createRes();
    await productController.product_image_update({}, uploadFailRes);
    await new Promise((resolve) => setImmediate(resolve));

    mockParse({ oldImage: "old.png", productId: "product-1", removeImage: "true" }, {});
    const removeLastImageRes = createRes();
    await productController.product_image_update({}, removeLastImageRes);
    await new Promise((resolve) => setImmediate(resolve));

    mockParse({ oldImage: "old.png", productId: "product-1", removeImage: "true" }, {});
    productModel.findById.mockResolvedValueOnce({
      id: "product-1",
      images: ["keep.png"],
    });
    const removeImageRes = createRes();
    await productController.product_image_update({}, removeImageRes);
    await new Promise((resolve) => setImmediate(resolve));

    mockParse({ productId: "product-1", addImage: "true" }, {});
    const addImageNoFileRes = createRes();
    await productController.product_image_update({}, addImageNoFileRes);
    await new Promise((resolve) => setImmediate(resolve));

    expect(defaultListRes.status).toHaveBeenCalledWith(200);
    expect(unauthorizedDeleteRes.status).toHaveBeenCalledWith(404);
    expect(parseErrRes.status).toHaveBeenCalledWith(400);
    expect(uploadFailRes.status).toHaveBeenCalledWith(404);
    expect(removeLastImageRes.status).toHaveBeenCalledWith(400);
    expect(removeImageRes.status).toHaveBeenCalledWith(200);
    expect(addImageNoFileRes.status).toHaveBeenCalledWith(400);
  });

  test("returns admin and seller dashboard summaries", async () => {
    myShopWallet.aggregate
      .mockResolvedValueOnce([{ _id: 1, total: 100 }])
      .mockResolvedValueOnce([{ totalAmount: 1000 }]);
    customerOrder.aggregate.mockResolvedValueOnce([{ _id: 1, total: 2 }]);
    sellerModel.aggregate.mockResolvedValueOnce([{ _id: 1, total: 3 }]);
    productModel.find.mockReturnValueOnce(createQueryChain([], { countDocuments: jest.fn().mockResolvedValue(5) }));
    customerOrder.find.mockReturnValueOnce(createQueryChain([], { countDocuments: jest.fn().mockResolvedValue(4) }));
    sellerModel.find.mockReturnValueOnce(createQueryChain([], { countDocuments: jest.fn().mockResolvedValue(6) }));
    adminSellerMessage.find.mockReturnValue(createQueryChain([{ id: 1 }]));
    customerOrder.find.mockReturnValueOnce(createQueryChain([{ id: 2 }]));

    const adminRes = createRes();
    await dashboardController.get_admin_dashboard_data({ query: { year: "2025" } }, adminRes);

    sellerWallet.aggregate
      .mockResolvedValueOnce([{ _id: 1, total: 50 }])
      .mockResolvedValueOnce([{ totalAmount: 500 }]);
    authOrder.aggregate
      .mockResolvedValueOnce([{ _id: 1, total: 2 }])
      .mockResolvedValueOnce([{ _id: 1, total: 3 }]);
    productModel.find.mockReturnValueOnce(createQueryChain([], { countDocuments: jest.fn().mockResolvedValue(5) }));
    authOrder.find.mockReturnValueOnce(createQueryChain([], { countDocuments: jest.fn().mockResolvedValue(4) }));
    authOrder.find.mockReturnValueOnce(createQueryChain([], { countDocuments: jest.fn().mockResolvedValue(1) }));
    sellerCustomerMessage.find.mockReturnValue(createQueryChain([{ id: 1 }]));
    authOrder.find.mockReturnValueOnce(createQueryChain([{ id: 2 }]));

    const sellerRes = createRes();
    await dashboardController.get_seller_dashboard_data({ id: "507f1f77bcf86cd799439011", query: { year: "2025" } }, sellerRes);

    expect(adminRes.status).toHaveBeenCalledWith(200);
    expect(sellerRes.status).toHaveBeenCalledWith(200);
  });

  test("manages banners", async () => {
    mockParse({ productId: "product-1" }, { mainban: { filepath: "/tmp/banner.png" } });
    productModel.findById.mockResolvedValue({ slug: "product-slug" });
    mockCloudinary.uploader.upload.mockResolvedValue({ url: "https://cdn.example/banner.png" });
    bannerModel.create.mockResolvedValue({ id: "banner-1" });

    await dashboardController.add_banner({}, createRes());

    bannerModel.findOne.mockResolvedValue({ id: "banner-1" });
    await dashboardController.get_banner({ params: { productId: "507f1f77bcf86cd799439011" } }, createRes());

    mockParse({}, { mainban: { filepath: "/tmp/banner2.png" } });
    bannerModel.findById.mockResolvedValueOnce({ banner: "https://cdn.example/old/banner.png" }).mockResolvedValueOnce({ id: "banner-1" });
    bannerModel.findByIdAndUpdate.mockResolvedValue({});
    await dashboardController.update_banner({ params: { bannerId: "banner-1" } }, createRes());

    bannerModel.aggregate.mockResolvedValue([{ id: 1 }]);
    const bannersRes = createRes();
    await dashboardController.get_banners({}, bannersRes);

    expect(bannersRes.status).toHaveBeenCalledWith(200);
  });

  test("covers active/deactive seller search branches", async () => {
    sellerModel.find
      .mockReturnValueOnce(createQueryChain([{ id: "s1" }]))
      .mockReturnValueOnce({ countDocuments: jest.fn().mockResolvedValue(1) })
      .mockReturnValueOnce(createQueryChain([{ id: "s2" }]))
      .mockReturnValueOnce({ countDocuments: jest.fn().mockResolvedValue(1) });

    const activeSearchRes = createRes();
    await sellerController.get_active_sellers(
      { query: { page: "1", parPage: "10", searchValue: "shop" } },
      activeSearchRes,
    );

    const deactiveSearchRes = createRes();
    await sellerController.get_deactive_sellers(
      { query: { page: "1", parPage: "10", searchValue: "shop" } },
      deactiveSearchRes,
    );

    expect(activeSearchRes.status).toHaveBeenCalledWith(200);
    expect(deactiveSearchRes.status).toHaveBeenCalledWith(200);
  });
});
