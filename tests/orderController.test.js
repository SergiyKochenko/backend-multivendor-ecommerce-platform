const mockStripe = {
  paymentIntents: { create: jest.fn() },
};

jest.mock("stripe", () => jest.fn(() => mockStripe));

jest.mock("../models/authOrder", () => ({
  updateMany: jest.fn(),
  insertMany: jest.fn(),
  find: jest.fn(),
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  aggregate: jest.fn(),
}));
jest.mock("../models/customerOrder", () => ({
  create: jest.fn(),
  find: jest.fn(),
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  aggregate: jest.fn(),
}));
jest.mock("../models/myShopWallet", () => ({
  create: jest.fn(),
  aggregate: jest.fn(),
}));
jest.mock("../models/sellerWallet", () => ({
  create: jest.fn(),
  aggregate: jest.fn(),
}));
jest.mock("../models/cardModel", () => ({
  findByIdAndDelete: jest.fn(),
}));

const orderController = require("../controllers/order/orderController");
const authOrderModel = require("../models/authOrder");
const customerOrder = require("../models/customerOrder");
const myShopWallet = require("../models/myShopWallet");
const sellerWallet = require("../models/sellerWallet");
const cardModel = require("../models/cardModel");
const { createRes, createQueryChain } = require("./testHelpers");

describe("orderController", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("places an order and clears the cart", async () => {
    const setTimeoutSpy = jest
      .spyOn(global, "setTimeout")
      .mockImplementation((fn) => {
        fn();
        return 0;
      });

    customerOrder.create.mockResolvedValue({ id: "order-1" });
    customerOrder.findById.mockResolvedValue({ payment_status: "unpaid" });
    customerOrder.findByIdAndUpdate.mockResolvedValue({});
    authOrderModel.updateMany.mockResolvedValue({});
    authOrderModel.insertMany.mockResolvedValue([]);
    cardModel.findByIdAndDelete.mockResolvedValue({});

    const req = {
      body: {
        price: 100,
        shipping_fee: 20,
        userId: "customer-1",
        shippingInfo: { city: "Berlin" },
        products: [
          {
            sellerId: "seller-1",
            price: 80,
            products: [
              { _id: "card-1", quantity: 2, productInfo: { name: "Phone" } },
            ],
          },
        ],
      },
    };
    const res = createRes();

    await orderController.place_order(req, res);

    expect(customerOrder.create).toHaveBeenCalled();
    expect(authOrderModel.insertMany).toHaveBeenCalledWith([
      expect.objectContaining({ sellerId: "seller-1", price: 80 }),
    ]);
    expect(cardModel.findByIdAndDelete).toHaveBeenCalledWith("card-1");
    expect(res.status).toHaveBeenCalledWith(200);

    setTimeoutSpy.mockRestore();
  });

  test("returns customer dashboard data", async () => {
    customerOrder.find.mockReturnValueOnce({ limit: jest.fn().mockResolvedValue([{ id: 1 }]) });
    customerOrder.find.mockReturnValueOnce({ countDocuments: jest.fn().mockResolvedValue(2) });
    customerOrder.find.mockReturnValueOnce({ countDocuments: jest.fn().mockResolvedValue(3) });
    customerOrder.find.mockReturnValueOnce({ countDocuments: jest.fn().mockResolvedValue(1) });

    const req = { params: { userId: "507f1f77bcf86cd799439011" } };
    const res = createRes();

    await orderController.get_customer_dashboard_data(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        recentOrders: [{ id: 1 }],
        pendingOrder: 2,
        totalOrder: 3,
        cancelledOrder: 1,
      }),
    );
  });

  test("returns orders for all statuses and by status", async () => {
    customerOrder.find.mockResolvedValueOnce([{ id: 1 }]);

    const req = { params: { customerId: "507f1f77bcf86cd799439011", status: "all" } };
    const res = createRes();

    await orderController.get_orders(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ orders: [{ id: 1 }] });
  });

  test("updates admin order status", async () => {
    const save = jest.fn();
    customerOrder.findById.mockResolvedValue({ payment_status: "paid", delivery_status: "processing", save });
    authOrderModel.updateMany.mockResolvedValue({});

    const req = { params: { orderId: "507f1f77bcf86cd799439011" }, body: { status: "shipped" } };
    const res = createRes();

    await orderController.admin_order_status_update(req, res);

    expect(save).toHaveBeenCalled();
    expect(authOrderModel.updateMany).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test("rejects invalid admin status transitions", async () => {
    customerOrder.findById
      .mockResolvedValueOnce({ payment_status: "unpaid", delivery_status: "pending", save: jest.fn() })
      .mockResolvedValueOnce({ payment_status: "paid", delivery_status: "delivered", save: jest.fn() })
      .mockResolvedValueOnce({ payment_status: "paid", delivery_status: "processing", save: jest.fn() })
      .mockResolvedValueOnce(null);

    const unpaidRes = createRes();
    await orderController.admin_order_status_update(
      { params: { orderId: "507f1f77bcf86cd799439011" }, body: { status: "delivered" } },
      unpaidRes,
    );

    const deliveredRes = createRes();
    await orderController.admin_order_status_update(
      { params: { orderId: "507f1f77bcf86cd799439011" }, body: { status: "shipped" } },
      deliveredRes,
    );

    const invalidRes = createRes();
    await orderController.admin_order_status_update(
      { params: { orderId: "507f1f77bcf86cd799439011" }, body: { status: "bad-status" } },
      invalidRes,
    );

    const notFoundRes = createRes();
    await orderController.admin_order_status_update(
      { params: { orderId: "507f1f77bcf86cd799439011" }, body: { status: "processing" } },
      notFoundRes,
    );

    expect(unpaidRes.status).toHaveBeenCalledWith(400);
    expect(deliveredRes.status).toHaveBeenCalledWith(400);
    expect(invalidRes.status).toHaveBeenCalledWith(400);
    expect(notFoundRes.status).toHaveBeenCalledWith(404);
  });

  test("creates a payment intent", async () => {
    mockStripe.paymentIntents.create.mockResolvedValue({ client_secret: "secret_1" });

    const req = { body: { price: 25 } };
    const res = createRes();

    await orderController.create_payment(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ clientSecret: "secret_1" });
  });

  test("confirms an order and creates wallet entries", async () => {
    customerOrder.findByIdAndUpdate.mockResolvedValue({});
    customerOrder.findById.mockResolvedValue({ price: 120 });
    authOrderModel.updateMany.mockResolvedValue({});
    authOrderModel.find.mockResolvedValue([{ sellerId: { toString: () => "seller-1" }, price: 80 }]);
    myShopWallet.create.mockResolvedValue({});
    sellerWallet.create.mockResolvedValue({});

    const req = { params: { orderId: "507f1f77bcf86cd799439011" } };
    const res = createRes();

    await orderController.order_confirm(req, res);

    expect(myShopWallet.create).toHaveBeenCalledWith(expect.objectContaining({ amount: 120 }));
    expect(sellerWallet.create).toHaveBeenCalledWith(expect.objectContaining({ amount: 80 }));
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test("covers order lookup helpers and lists", async () => {
    customerOrder.findById
      .mockResolvedValueOnce({ payment_status: "unpaid" })
      .mockResolvedValueOnce({ payment_status: "paid", delivery_status: "cancelled", save: jest.fn() })
      .mockResolvedValueOnce({ payment_status: "paid", delivery_status: "pending" });
    customerOrder.findByIdAndUpdate.mockResolvedValue({});
    authOrderModel.updateMany.mockResolvedValue({});
    customerOrder.aggregate.mockReturnValueOnce(createQueryChain([{ id: 1 }], { skip: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), sort: jest.fn().mockResolvedValue([{ id: 1 }]) }));
    customerOrder.aggregate.mockResolvedValueOnce([{ id: 1 }]);
    authOrderModel.find
      .mockReturnValueOnce(createQueryChain([{ id: 2 }]))
      .mockReturnValueOnce({ countDocuments: jest.fn().mockResolvedValue(1) });

    const helperResult = await orderController.paymentCheck("507f1f77bcf86cd799439011");
    const adminListRes = createRes();
    await orderController.get_admin_orders({ query: { page: "1", parPage: "10" } }, adminListRes);
    const sellerListRes = createRes();
    await orderController.get_seller_orders({ params: { sellerId: "507f1f77bcf86cd799439011" }, query: { page: "1", parPage: "10" } }, sellerListRes);
    const orderDetailsRes = createRes();
    await orderController.get_order_details({ params: { orderId: "507f1f77bcf86cd799439011" } }, orderDetailsRes);

    expect(helperResult).toBe(true);
    expect(adminListRes.status).toHaveBeenCalledWith(200);
    expect(sellerListRes.status).toHaveBeenCalledWith(200);
    expect(orderDetailsRes.status).toHaveBeenCalledWith(200);
  });

  test("covers filtered order lookup branches", async () => {
    customerOrder.find.mockResolvedValue([{ id: "o1" }]);
    customerOrder.aggregate.mockResolvedValue([{ id: "admin-order" }]);
    authOrderModel.findById
      .mockResolvedValueOnce({ id: "sub-order-1" })
      .mockResolvedValueOnce({
        orderId: "507f1f77bcf86cd799439011",
        payment_status: "paid",
        delivery_status: "processing",
      });
    authOrderModel.find.mockResolvedValue([
      { delivery_status: "shipped" },
      { delivery_status: "processing" },
    ]);
    authOrderModel.findByIdAndUpdate.mockResolvedValue({});
    customerOrder.findByIdAndUpdate.mockResolvedValue({});

    const filteredRes = createRes();
    await orderController.get_orders(
      { params: { customerId: "507f1f77bcf86cd799439011", status: "pending" } },
      filteredRes,
    );

    const sellerOrderRes = createRes();
    await orderController.get_seller_order({ params: { orderId: "507f1f77bcf86cd799439011" } }, sellerOrderRes);

    const sellerStatusRes = createRes();
    await orderController.seller_order_status_update(
      { params: { orderId: "507f1f77bcf86cd799439011" }, body: { status: "shipped" } },
      sellerStatusRes,
    );

    const adminOrderRes = createRes();
    await orderController.get_admin_order(
      { params: { orderId: "507f1f77bcf86cd799439011" } },
      adminOrderRes,
    );

    expect(filteredRes.status).toHaveBeenCalledWith(200);
    expect(sellerOrderRes.status).toHaveBeenCalledWith(200);
    expect(sellerStatusRes.status).toHaveBeenCalledWith(200);
    expect(adminOrderRes.status).toHaveBeenCalledWith(200);
    expect(customerOrder.findByIdAndUpdate).toHaveBeenCalledWith(
      "507f1f77bcf86cd799439011",
      { delivery_status: "processing" },
    );
  });
});