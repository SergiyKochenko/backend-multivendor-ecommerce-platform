jest.mock("../models/sellerModel", () => ({
  findById: jest.fn(),
  find: jest.fn(),
}));
jest.mock("../models/customerModel", () => ({
  findById: jest.fn(),
}));
jest.mock("../models/chat/sellerCustomerModel", () => ({
  findOne: jest.fn(),
  updateOne: jest.fn(),
}));
jest.mock("../models/chat/sellerCustomerMessage", () => ({
  find: jest.fn(),
  create: jest.fn(),
}));
jest.mock("../models/chat/adminSellerMessage", () => ({
  find: jest.fn(),
  create: jest.fn(),
}));

const sellerModel = require("../models/sellerModel");
const customerModel = require("../models/customerModel");
const sellerCustomerModel = require("../models/chat/sellerCustomerModel");
const sellerCustomerMessage = require("../models/chat/sellerCustomerMessage");
const adminSellerMessage = require("../models/chat/adminSellerMessage");
const chatController = require("../controllers/chat/ChatController");
const { createRes } = require("./testHelpers");

describe("ChatController", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("adds customer and seller friends and fetches messages", async () => {
    sellerModel.findById.mockResolvedValue({ image: "seller.png", shopInfo: { shopName: "Shop" } });
    customerModel.findById.mockResolvedValue({ name: "Alice" });
    sellerCustomerModel.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ myFriends: [{ fdId: "seller-1" }] });
    sellerCustomerMessage.find.mockResolvedValue([{ id: 1 }]);
    sellerCustomerModel.updateOne.mockResolvedValue({});

    const res = createRes();
    await chatController.add_customer_friend({ body: { sellerId: "seller-1", userId: "customer-1" } }, res);

    expect(res.status).toHaveBeenCalledWith(200);
  });

  test("returns friend list when seller id is empty", async () => {
    sellerCustomerModel.findOne.mockResolvedValue({ myFriends: [{ fdId: "seller-1" }] });
    const res = createRes();

    await chatController.add_customer_friend(
      { body: { sellerId: "", userId: "customer-1" } },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(200);
  });

  test("skips friend insertion when relationships already exist", async () => {
    sellerModel.findById.mockResolvedValue({ image: "seller.png", shopInfo: { shopName: "Shop" } });
    customerModel.findById.mockResolvedValue({ name: "Alice" });
    sellerCustomerModel.findOne
      .mockResolvedValueOnce({ myId: "customer-1" })
      .mockResolvedValueOnce({ myId: "seller-1" })
      .mockResolvedValueOnce({ myFriends: [{ fdId: "seller-1" }] });
    sellerCustomerMessage.find.mockResolvedValue([]);

    const res = createRes();
    await chatController.add_customer_friend({ body: { sellerId: "seller-1", userId: "customer-1" } }, res);

    expect(sellerCustomerModel.updateOne).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test("adds and reorders chat messages", async () => {
    sellerCustomerMessage.create.mockResolvedValue({ id: "message-1" });
    sellerCustomerModel.findOne
      .mockResolvedValueOnce({ myFriends: [{ fdId: "seller-1" }, { fdId: "customer-1" }] })
      .mockResolvedValueOnce({ myFriends: [{ fdId: "customer-1" }, { fdId: "seller-1" }] });
    sellerCustomerModel.updateOne.mockResolvedValue({});

    const res = createRes();
    await chatController.customer_message_add({ body: { userId: "customer-1", sellerId: "seller-1", text: "Hi", name: "Alice" } }, res);
    await chatController.seller_message_add({ body: { senderId: "seller-1", receverId: "customer-1", text: "Hello", name: "Shop" } }, res);

    expect(res.status).toHaveBeenCalledWith(201);
  });

  test("fetches seller, customer, and admin messages", async () => {
    sellerCustomerModel.findOne.mockResolvedValue({ myFriends: [{ fdId: "customer-1" }] });
    sellerCustomerMessage.find.mockResolvedValue([{ id: 1 }]);
    customerModel.findById.mockResolvedValue({ name: "Alice" });
    sellerModel.find.mockResolvedValue([{ id: 1 }]);
    adminSellerMessage.create.mockResolvedValue({ id: "msg-1" });
    adminSellerMessage.find.mockResolvedValue([{ id: 2 }]);
    sellerModel.findById.mockResolvedValue({ name: "Seller" });

    const res = createRes();
    await chatController.get_customers({ params: { sellerId: "seller-1" } }, res);
    await chatController.get_customers_seller_message({ params: { customerId: "customer-1" }, id: "seller-1" }, res);
    await chatController.get_sellers({}, res);
    await chatController.seller_admin_message_insert({ body: { senderId: "seller-1", receverId: "admin-1", message: "Hi", senderName: "Shop" } }, res);
    await chatController.get_admin_messages({ params: { receverId: "seller-1" } }, res);
    await chatController.get_seller_messages({ id: "seller-1" }, res);

    expect(res.status).toHaveBeenCalledWith(200);
  });
});