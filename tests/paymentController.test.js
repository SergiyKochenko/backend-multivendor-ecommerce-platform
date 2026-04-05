jest.mock("uuid", () => ({
  v4: jest.fn(() => "test-uuid"),
}));

const mockStripe = {
  accounts: { create: jest.fn() },
  accountLinks: { create: jest.fn() },
  transfers: { create: jest.fn() },
  paymentIntents: { create: jest.fn() },
};

jest.mock("stripe", () => jest.fn(() => mockStripe));
jest.mock("../models/sellerModel", () => ({
  findByIdAndUpdate: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn(),
}));
jest.mock("../models/stripeModel", () => ({
  findOne: jest.fn(),
  deleteOne: jest.fn(),
  create: jest.fn(),
}));
jest.mock("../models/sellerWallet", () => ({
  find: jest.fn(),
  create: jest.fn(),
}));
jest.mock("../models/withdrowRequest", () => ({
  find: jest.fn(),
  create: jest.fn(),
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
}));

const paymentController = require("../controllers/payment/paymentController");
const sellerModel = require("../models/sellerModel");
const stripeModel = require("../models/stripeModel");
const sellerWallet = require("../models/sellerWallet");
const withdrowRequest = require("../models/withdrowRequest");
const { createRes } = require("./testHelpers");

describe("paymentController", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.STRIPE_SECRET = "test-secret";
  });

  test("creates a stripe connect account when none exists", async () => {
    stripeModel.findOne.mockResolvedValue(null);
    mockStripe.accounts.create.mockResolvedValue({ id: "acct_1" });
    mockStripe.accountLinks.create.mockResolvedValue({ url: "https://stripe.example/link" });
    stripeModel.create.mockResolvedValue({});

    const req = { id: "seller-1" };
    const res = createRes();

    await paymentController.create_stripe_connect_account(req, res);

    expect(stripeModel.create).toHaveBeenCalledWith({
      sellerId: "seller-1",
      stripeId: "acct_1",
      code: "test-uuid",
    });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ url: "https://stripe.example/link" });
  });

  test("replaces an existing stripe connect account", async () => {
    stripeModel.findOne.mockResolvedValue({ sellerId: "seller-1" });
    mockStripe.accounts.create.mockResolvedValue({ id: "acct_2" });
    mockStripe.accountLinks.create.mockResolvedValue({ url: "https://stripe.example/new-link" });
    stripeModel.create.mockResolvedValue({});

    const req = { id: "seller-1" };
    const res = createRes();

    await paymentController.create_stripe_connect_account(req, res);

    expect(stripeModel.deleteOne).toHaveBeenCalledWith({ sellerId: "seller-1" });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ url: "https://stripe.example/new-link" });
  });

  test("activates a stripe connect account", async () => {
    stripeModel.findOne.mockResolvedValue({ code: "active-1" });
    sellerModel.findByIdAndUpdate.mockResolvedValue({});

    const req = { params: { activeCode: "active-1" }, id: "seller-1" };
    const res = createRes();

    await paymentController.active_stripe_connect_account(req, res);

    expect(sellerModel.findByIdAndUpdate).toHaveBeenCalledWith("seller-1", { payment: "active" });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test("handles inactive stripe connect account code", async () => {
    stripeModel.findOne.mockResolvedValue(null);

    const req = { params: { activeCode: "invalid" }, id: "seller-1" };
    const res = createRes();

    await paymentController.active_stripe_connect_account(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  test("returns seller payment details", async () => {
    sellerWallet.find.mockResolvedValue([{ amount: 100 }, { amount: 50 }]);
    withdrowRequest.find
      .mockResolvedValueOnce([{ amount: 10 }])
      .mockResolvedValueOnce([{ amount: 15 }]);

    const req = { params: { sellerId: "seller-1" } };
    const res = createRes();

    await paymentController.get_seller_payment_details(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        totalAmount: 150,
        pendingAmount: 10,
        withdrowAmount: 15,
        availableAmount: 125,
      }),
    );
  });

  test("creates a withdrawal request", async () => {
    withdrowRequest.create.mockResolvedValue({ id: "withdraw-1", amount: 250 });

    const req = { body: { amount: "250", sellerId: "seller-1" } };
    const res = createRes();

    await paymentController.withdrowal_request(req, res);

    expect(withdrowRequest.create).toHaveBeenCalledWith({ sellerId: "seller-1", amount: 250 });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test("returns withdrawal requests with seller names", async () => {
    withdrowRequest.find.mockResolvedValue([
      {
        sellerId: "seller-1",
        toObject: () => ({ sellerId: "seller-1", amount: 10 }),
      },
    ]);
    sellerModel.find.mockReturnValue({
      select: jest.fn().mockResolvedValue([{ _id: { toString: () => "seller-1" }, name: "Shop One" }]),
    });

    const req = {};
    const res = createRes();

    await paymentController.get_payment_request(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      withdrowalRequest: [
        {
          sellerId: "seller-1",
          amount: 10,
          sellerName: "Shop One",
        },
      ],
    });
  });

  test("confirms a withdrawal request", async () => {
    withdrowRequest.findById.mockResolvedValue({ sellerId: "507f1f77bcf86cd799439011", amount: 20 });
    stripeModel.findOne.mockResolvedValue({ stripeId: "acct_dest" });
    mockStripe.transfers.create.mockResolvedValue({});
    withdrowRequest.findByIdAndUpdate.mockResolvedValue({});

    const req = { body: { paymentId: "payment-1" } };
    const res = createRes();

    await paymentController.payment_request_confirm(req, res);

    expect(mockStripe.transfers.create).toHaveBeenCalledWith({
      amount: 2000,
      currency: "eur",
      destination: "acct_dest",
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test("handles withdrawal confirm failure", async () => {
    withdrowRequest.findById.mockRejectedValue(new Error("db error"));

    const req = { body: { paymentId: "payment-1" } };
    const res = createRes();

    await paymentController.payment_request_confirm(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});