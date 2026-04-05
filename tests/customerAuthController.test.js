jest.mock("bcrypt", () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

jest.mock("../utiles/tokenCreate", () => ({
  createToken: jest.fn(),
}));

jest.mock("../models/customerModel", () => ({
  findOne: jest.fn(),
  create: jest.fn(),
  findById: jest.fn(),
}));
jest.mock("../models/chat/sellerCustomerModel", () => ({
  create: jest.fn(),
}));

const bcrypt = require("bcrypt");
const { createToken } = require("../utiles/tokenCreate");
const customerModel = require("../models/customerModel");
const sellerCustomerModel = require("../models/chat/sellerCustomerModel");
const customerAuthController = require("../controllers/home/customerAuthController");
const { createRes } = require("./testHelpers");

describe("customerAuthController", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.mode = "test";
  });

  test("registers a new customer", async () => {
    customerModel.findOne.mockResolvedValue(null);
    customerModel.create.mockResolvedValue({ id: "customer-1", name: "Alice", email: "alice@example.com", method: "menualy" });
    sellerCustomerModel.create.mockResolvedValue({});
    bcrypt.hash.mockResolvedValue("hashed-password");
    createToken.mockResolvedValue("customer-token");

    const req = { body: { name: " Alice ", email: " alice@example.com ", password: "secret" } };
    const res = createRes();

    await customerAuthController.customer_register(req, res);

    expect(customerModel.create).toHaveBeenCalledWith({
      name: "Alice",
      email: "alice@example.com",
      password: "hashed-password",
      method: "menualy",
    });
    expect(res.cookie).toHaveBeenCalledWith("customerToken", "customer-token", expect.any(Object));
    expect(res.status).toHaveBeenCalledWith(201);
  });

  test("rejects duplicate customer registration", async () => {
    customerModel.findOne.mockResolvedValue({ email: "alice@example.com" });

    const req = { body: { name: "Alice", email: "alice@example.com", password: "secret" } };
    const res = createRes();

    await customerAuthController.customer_register(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: "Email Already Exits" });
  });

  test("logs in a customer", async () => {
    customerModel.findOne.mockReturnValue({
      select: jest.fn().mockResolvedValue({
        id: "customer-1",
        name: "Alice",
        email: "alice@example.com",
        method: "menualy",
        password: "hashed-password",
      }),
    });
    bcrypt.compare.mockResolvedValue(true);
    createToken.mockResolvedValue("customer-token");

    const req = { body: { email: "alice@example.com", password: "secret" } };
    const res = createRes();

    await customerAuthController.customer_login(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.cookie).toHaveBeenCalledWith("customerToken", "customer-token", expect.any(Object));
  });

  test("rejects incorrect customer password", async () => {
    customerModel.findOne.mockReturnValue({
      select: jest.fn().mockResolvedValue({ password: "hashed-password" }),
    });
    bcrypt.compare.mockResolvedValue(false);

    const req = { body: { email: "alice@example.com", password: "bad" } };
    const res = createRes();

    await customerAuthController.customer_login(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: "Password Wrong" });
  });

  test("rejects login when customer email does not exist", async () => {
    customerModel.findOne.mockReturnValue({
      select: jest.fn().mockResolvedValue(null),
    });

    const req = { body: { email: "missing@example.com", password: "secret" } };
    const res = createRes();

    await customerAuthController.customer_login(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: "Email Not Found" });
  });

  test("logs out the customer", async () => {
    const req = {};
    const res = createRes();

    await customerAuthController.customer_logout(req, res);

    expect(res.cookie).toHaveBeenCalledWith("customerToken", "", expect.any(Object));
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test("changes customer password", async () => {
    const save = jest.fn();
    customerModel.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({ password: "hashed-password", save }),
    });
    bcrypt.compare.mockResolvedValue(true);
    bcrypt.hash.mockResolvedValue("new-hash");

    const req = { id: "customer-1", body: { old_password: "old", new_password: "new" } };
    const res = createRes();

    await customerAuthController.change_password(req, res);

    expect(save).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test("handles missing customer and wrong old password", async () => {
    customerModel.findById.mockReturnValueOnce({
      select: jest.fn().mockResolvedValue(null),
    });
    customerModel.findById.mockReturnValueOnce({
      select: jest.fn().mockResolvedValue({ password: "hashed-password" }),
    });
    bcrypt.compare.mockResolvedValue(false);

    const notFoundRes = createRes();
    await customerAuthController.change_password(
      { id: "customer-1", body: { old_password: "old", new_password: "new" } },
      notFoundRes,
    );

    const wrongOldRes = createRes();
    await customerAuthController.change_password(
      { id: "customer-1", body: { old_password: "bad", new_password: "new" } },
      wrongOldRes,
    );

    expect(notFoundRes.status).toHaveBeenCalledWith(404);
    expect(wrongOldRes.status).toHaveBeenCalledWith(400);
  });
});