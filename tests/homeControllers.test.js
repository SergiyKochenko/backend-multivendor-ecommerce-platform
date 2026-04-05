jest.mock("../models/categoryModel", () => ({
  find: jest.fn(),
}));
jest.mock("../models/productModel", () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  findByIdAndUpdate: jest.fn(),
}));
jest.mock("../models/reviewModel", () => ({
  create: jest.fn(),
  find: jest.fn(),
  aggregate: jest.fn(),
}));

const categoryModel = require("../models/categoryModel");
const productModel = require("../models/productModel");
const reviewModel = require("../models/reviewModel");
const homeControllers = require("../controllers/home/homeControllers");
const { createRes, createQueryChain } = require("./testHelpers");

describe("homeControllers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("formats products into groups of three", () => {
    expect(homeControllers.formateProduct([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }])).toEqual([
      [{ id: 1 }, { id: 2 }, { id: 3 }],
      [{ id: 4 }],
    ]);
  });

  test("returns categories", async () => {
    categoryModel.find.mockResolvedValue([{ name: "Phones" }]);
    const res = createRes();

    await homeControllers.get_categorys({}, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ categorys: [{ name: "Phones" }] });
  });

  test("returns the home product payload", async () => {
    productModel.find
      .mockReturnValueOnce(createQueryChain([{ id: 1 }]))
      .mockReturnValueOnce(createQueryChain([{ id: 2 }, { id: 3 }, { id: 4 }]))
      .mockReturnValueOnce(createQueryChain([{ id: 5 }, { id: 6 }, { id: 7 }]))
      .mockReturnValueOnce(createQueryChain([{ id: 8 }, { id: 9 }, { id: 10 }]));

    const res = createRes();

    await homeControllers.get_products({}, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      products: [{ id: 1 }],
    }));
  });

  test("returns price range and latest products", async () => {
    productModel.find
      .mockReturnValueOnce(createQueryChain([{ id: 1 }, { id: 2 }, { id: 3 }]))
      .mockReturnValueOnce(createQueryChain([{ price: 50 }, { price: 150 }]));

    const res = createRes();

    await homeControllers.price_range_product({}, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      priceRange: { low: 50, high: 150 },
    }));
  });

  test("returns default price range when no products exist", async () => {
    productModel.find
      .mockReturnValueOnce(createQueryChain([]))
      .mockReturnValueOnce(createQueryChain([]));

    const res = createRes();
    await homeControllers.price_range_product({}, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      priceRange: { low: 0, high: 0 },
    }));
  });

  test("queries products with filters", async () => {
    productModel.find.mockReturnValue(createQueryChain([
      { category: "phones", rating: 5, name: "iPhone", price: 900 },
      { category: "phones", rating: 4, name: "Pixel", price: 700 },
    ]));

    const req = { query: { category: "phones", rating: "4", searchValue: "pixel", lowPrice: "600", highPrice: "1000", sortPrice: "low-to-high", pageNumber: "1" } };
    const res = createRes();

    await homeControllers.query_products(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
  });

  test("returns product details and reviews", async () => {
    productModel.findOne.mockResolvedValue({
      id: "507f1f77bcf86cd799439011",
      category: "phones",
      sellerId: "seller-1",
    });
    productModel.find
      .mockReturnValueOnce(createQueryChain([{ id: 2 }]))
      .mockReturnValueOnce(createQueryChain([{ id: 3 }]));

    const res = createRes();

    await homeControllers.product_details({ params: { slug: "iphone" } }, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      product: expect.any(Object),
    }));
  });

  test("submits a review and recalculates rating", async () => {
    reviewModel.create.mockResolvedValue({});
    reviewModel.find.mockResolvedValue([{ rating: 4 }, { rating: 5 }]);
    productModel.findByIdAndUpdate.mockResolvedValue({});

    const req = { body: { productId: "507f1f77bcf86cd799439011", rating: 5, review: "Great", name: "Alice" } };
    const res = createRes();

    await homeControllers.submit_review(req, res);

    expect(productModel.findByIdAndUpdate).toHaveBeenCalledWith("507f1f77bcf86cd799439011", { rating: "4.5" });
    expect(res.status).toHaveBeenCalledWith(201);
  });

  test("returns reviews and rating breakdown", async () => {
    reviewModel.aggregate.mockResolvedValue([{ _id: 5, count: 2 }]);
    reviewModel.find
      .mockResolvedValueOnce([{ rating: 5 }])
      .mockReturnValueOnce({ skip: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), sort: jest.fn().mockResolvedValue([{ rating: 5 }]) });

    const req = { params: { productId: "507f1f77bcf86cd799439011" }, query: { pageNo: "1" } };
    const res = createRes();

    await homeControllers.get_reviews(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ totalReview: 1 }));
  });
});