jest.mock("uuid", () => ({
  v4: jest.fn(() => "test-uuid"),
}));

const request = require("supertest");

describe("express app", () => {
  test("responds on the health route", async () => {
    const { app } = require("../app");

    await request(app).get("/").expect(200, "Hello Server");
  });

  test("allows configured origin", async () => {
    const { app } = require("../app");

    const response = await request(app)
      .get("/")
      .set("Origin", "http://localhost:3000")
      .expect(200);

    expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:3000");
  });

  test("blocks unconfigured origin", async () => {
    const { app } = require("../app");

    await request(app)
      .get("/")
      .set("Origin", "http://blocked.example.com")
      .expect(500);
  });
});