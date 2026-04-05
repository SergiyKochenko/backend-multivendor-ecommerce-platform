const request = require("supertest");

const mockIo = {
  on: jest.fn(),
  emit: jest.fn(),
};

jest.mock("socket.io", () => jest.fn(() => mockIo));
jest.mock("uuid", () => ({
  v4: jest.fn(() => "test-uuid"),
}));
jest.mock("../utiles/db", () => ({
  dbConnect: jest.fn(),
}));

describe("server module", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  test("creates server and registers socket handlers", () => {
    const { createServer } = require("../server");
    const socketFactory = require("socket.io");

    const { server, io } = createServer();

    expect(server).toBeDefined();
    expect(io).toBe(mockIo);
    expect(socketFactory).toHaveBeenCalledWith(
      server,
      expect.objectContaining({
        cors: expect.objectContaining({ methods: ["GET", "POST"] }),
      }),
    );
    expect(mockIo.on).toHaveBeenCalledWith("connection", expect.any(Function));
  });

  test("starts server and connects db", () => {
    const db = require("../utiles/db");
    const { startServer } = require("../server");
    const listenSpy = jest
      .spyOn(require("http").Server.prototype, "listen")
      .mockImplementation(function listenMock(_port, cb) {
        if (cb) cb();
        return this;
      });

    process.env.PORT = "5055";
    startServer();

    expect(db.dbConnect).toHaveBeenCalledTimes(1);
    expect(listenSpy).toHaveBeenCalled();

    listenSpy.mockRestore();
  });

  test("covers socket event branches", () => {
    const { createServer } = require("../server");
    createServer();

    const connectionHandler = mockIo.on.mock.calls.find((c) => c[0] === "connection")[1];

    const handlers = {};
    const toEmit = jest.fn();
    const soc = {
      id: "soc-1",
      on: jest.fn((event, cb) => {
        handlers[event] = cb;
      }),
      to: jest.fn(() => ({ emit: toEmit })),
    };

    connectionHandler(soc);

    handlers.add_user("customer-1", { name: "Customer" });
    handlers.add_user("customer-1", { name: "Customer" });
    handlers.add_seller("seller-1", { shop: "Shop" });
    handlers.add_seller("seller-1", { shop: "Shop" });

    handlers.send_seller_message({ receverId: "customer-1", text: "hello" });
    handlers.send_seller_message({ receverId: "missing", text: "hello" });
    handlers.send_customer_message({ receverId: "seller-1", text: "hello" });
    handlers.send_customer_message({ receverId: "missing", text: "hello" });

    handlers.send_message_admin_to_seller({ receverId: "seller-1", text: "admin" });
    handlers.send_message_admin_to_seller({ receverId: "missing", text: "admin" });

    handlers.send_message_seller_to_admin({ text: "before-admin" });
    handlers.add_admin({ name: "admin", email: "hidden", password: "hidden" });
    handlers.send_message_seller_to_admin({ text: "after-admin" });

    handlers.disconnect();

    expect(soc.to).toHaveBeenCalled();
    expect(toEmit).toHaveBeenCalled();
    expect(mockIo.emit).toHaveBeenCalledWith("activeSeller", expect.any(Array));
  });

  test("exports app route", async () => {
    const { app } = require("../server");
    await request(app).get("/").expect(200, "Hello Server");
  });
});
