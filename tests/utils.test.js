jest.mock("jsonwebtoken", () => ({
  sign: jest.fn(),
  verify: jest.fn(),
}));

const jwt = require("jsonwebtoken");
const { createToken } = require("../utiles/tokenCreate");
const { responseReturn } = require("../utiles/response");
const queryProducts = require("../utiles/queryProducts");
const { dbConnect } = require("../utiles/db");
const { authMiddleware } = require("../middlewares/authMiddleware");
const { customerAuthMiddleware } = require("../middlewares/customerAuthMiddleware");
const mongoose = require("mongoose");
const { createRes } = require("./testHelpers");

describe("utility modules", () => {
  beforeEach(() => {
    process.env.SECRET = "test-secret";
    process.env.mode = "test";
    jest.clearAllMocks();
  });

  test("responseReturn sends status and payload", () => {
    const res = createRes();

    responseReturn(res, 201, { ok: true });

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  test("createToken signs payload with configured secret", async () => {
    jwt.sign.mockReturnValue("signed-token");

    await expect(createToken({ id: "1" })).resolves.toBe("signed-token");
    expect(jwt.sign).toHaveBeenCalledWith(
      { id: "1" },
      "test-secret",
      { expiresIn: "7d" },
    );
  });

  test("queryProducts applies all supported filters", () => {
    const products = [
      { category: "phones", rating: 5, name: "iPhone", price: 900 },
      { category: "phones", rating: 4, name: "Pixel", price: 700 },
      { category: "laptops", rating: 3, name: "ThinkPad", price: 1200 },
      { category: "phones", rating: 2, name: "Nokia", price: 100 },
    ];

    const filtered = new queryProducts(products, {
      category: "phones",
      rating: "4",
      searchValue: "pi",
      lowPrice: "600",
      highPrice: "1000",
      sortPrice: "low-to-high",
      pageNumber: "1",
      parPage: "1",
    })
      .categoryQuery()
      .ratingQuery()
      .searchQuery()
      .priceQuery()
      .sortByPrice()
      .skip()
      .limit()
      .getProducts();

    expect(filtered).toEqual([{ category: "phones", rating: 4, name: "Pixel", price: 700 }]);
  });

  test("queryProducts countProducts returns filtered length and ignores absent price filters", () => {
    const products = [
      { category: "phones", rating: 5, name: "Alpha", price: 300 },
      { category: "phones", rating: 4, name: "Beta", price: 200 },
    ];

    const filtered = new queryProducts(products, { category: "phones" })
      .categoryQuery()
      .priceQuery()
      .sortByPrice()
      .countProducts();

    expect(filtered).toBe(2);
  });

  test("authMiddleware accepts valid access token", async () => {
    jwt.verify.mockResolvedValue({ role: "seller", id: "seller-1" });
    const req = { cookies: { accessToken: "token" } };
    const res = createRes();
    const next = jest.fn();

    await authMiddleware(req, res, next);

    expect(req.role).toBe("seller");
    expect(req.id).toBe("seller-1");
    expect(next).toHaveBeenCalledTimes(1);
  });

  test("authMiddleware rejects missing token", async () => {
    const req = { cookies: {} };
    const res = createRes();
    const next = jest.fn();

    await authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ error: "Please Login First" });
    expect(next).not.toHaveBeenCalled();
  });

  test("customerAuthMiddleware accepts cookie token and bearer token", async () => {
    jwt.verify.mockResolvedValue({ id: "customer-1" });
    const req = {
      cookies: {},
      headers: { authorization: "Bearer customer-token" },
    };
    const res = createRes();
    const next = jest.fn();

    await customerAuthMiddleware(req, res, next);

    expect(jwt.verify).toHaveBeenCalledWith("customer-token", "test-secret");
    expect(req.id).toBe("customer-1");
    expect(next).toHaveBeenCalledTimes(1);
  });

  test("customerAuthMiddleware rejects missing token", async () => {
    const req = { cookies: {}, headers: {} };
    const res = createRes();
    const next = jest.fn();

    await customerAuthMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ error: "Please Login First" });
    expect(next).not.toHaveBeenCalled();
  });

  test("dbConnect uses local db url when mode is not pro", async () => {
    const connectSpy = jest.spyOn(mongoose, "connect").mockResolvedValue();

    await dbConnect();

    expect(connectSpy).toHaveBeenCalledWith(process.env.DB_LOCAL_URL);
    connectSpy.mockRestore();
  });

  test("dbConnect uses production db url when mode is pro", async () => {
    process.env.mode = "pro";
    process.env.DB_PRO_URL = "mongodb://production";
    const connectSpy = jest.spyOn(mongoose, "connect").mockResolvedValue();

    await dbConnect();

    expect(connectSpy).toHaveBeenCalledWith("mongodb://production");
    connectSpy.mockRestore();
  });
});