jest.mock("../models/cardModel", () => ({
  findOne: jest.fn(),
  create: jest.fn(),
  aggregate: jest.fn(),
  findByIdAndDelete: jest.fn(),
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
}));
jest.mock("../models/wishlistModel", () => ({
  findOne: jest.fn(),
  create: jest.fn(),
  find: jest.fn(),
  findByIdAndDelete: jest.fn(),
}));

const cardModel = require("../models/cardModel");
const wishlistModel = require("../models/wishlistModel");
const cardController = require("../controllers/home/cardController");
const { createRes } = require("./testHelpers");

describe("cardController", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("adds a product to card", async () => {
    cardModel.findOne.mockResolvedValue(null);
    cardModel.create.mockResolvedValue({ id: "card-1" });

    const req = { body: { userId: "user-1", productId: "product-1", quantity: 2 } };
    const res = createRes();

    await cardController.add_to_card(req, res);

    expect(cardModel.create).toHaveBeenCalledWith({ userId: "user-1", productId: "product-1", quantity: 2 });
    expect(res.status).toHaveBeenCalledWith(201);
  });

  test("returns card product summary", async () => {
    cardModel.aggregate.mockResolvedValue([
      {
        _id: "card-1",
        quantity: 2,
        products: [
          {
            stock: 5,
            price: 100,
            discount: 10,
            sellerId: "seller-1",
            shopName: "Shop One",
          },
        ],
      },
    ]);

    const req = { params: { userId: "507f1f77bcf86cd799439011" } };
    const res = createRes();

    await cardController.get_card_products(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      price: 180,
      card_product_count: 2,
      shipping_fee: 20,
    }));
  });

  test("increments and decrements quantity", async () => {
    cardModel.findById.mockResolvedValue({ quantity: 2 });
    cardModel.findByIdAndUpdate.mockResolvedValue({});

    const req = { params: { card_id: "card-1" } };
    const res = createRes();

    await cardController.quantity_inc(req, res);
    await cardController.quantity_dec(req, res);

    expect(cardModel.findByIdAndUpdate).toHaveBeenCalledWith("card-1", { quantity: 3 });
    expect(cardModel.findByIdAndUpdate).toHaveBeenCalledWith("card-1", { quantity: 1 });
  });

  test("manages wishlist entries", async () => {
    wishlistModel.findOne.mockResolvedValue(null);
    wishlistModel.create.mockResolvedValue({});
    wishlistModel.find.mockResolvedValue([{ id: 1 }]);
    wishlistModel.findByIdAndDelete.mockResolvedValue({});

    const addReq = {
      body: {
        slug: "product-1",
        userId: "user-1",
        productId: "product-1",
      },
    };
    const addRes = createRes();
    await cardController.add_wishlist(addReq, addRes);

    const listReq = { params: { userId: "user-1" } };
    const listRes = createRes();
    await cardController.get_wishlist(listReq, listRes);

    const removeReq = { params: { wishlistId: "wish-1" } };
    const removeRes = createRes();
    await cardController.remove_wishlist(removeReq, removeRes);

    expect(addRes.status).toHaveBeenCalledWith(201);
    expect(listRes.status).toHaveBeenCalledWith(200);
    expect(removeRes.status).toHaveBeenCalledWith(200);
  });

  test("blocks duplicate wishlist entries per user and product", async () => {
    wishlistModel.findOne.mockResolvedValue({ _id: "wish-1" });

    const req = {
      body: {
        slug: "product-1",
        userId: "user-1",
        productId: "product-1",
      },
    };
    const res = createRes();

    await cardController.add_wishlist(req, res);

    expect(wishlistModel.findOne).toHaveBeenCalledWith({
      userId: "user-1",
      productId: "product-1",
    });
    expect(wishlistModel.create).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Product Is Already In Wishlist" }),
    );
  });
});