jest.mock("bcrypt", () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));
jest.mock("../utiles/tokenCreate", () => ({
  createToken: jest.fn(),
}));
jest.mock("formidable", () => jest.fn());
jest.mock("cloudinary", () => ({
  v2: {
    config: jest.fn(),
    uploader: {
      upload: jest.fn(),
    },
  },
}));

jest.mock("../models/adminModel", () => ({
  findOne: jest.fn(),
  findById: jest.fn(),
}));
jest.mock("../models/sellerModel", () => ({
  findOne: jest.fn(),
  create: jest.fn(),
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
}));
jest.mock("../models/chat/sellerCustomerModel", () => ({
  create: jest.fn(),
}));

const formidable = require("formidable");
const bcrypt = require("bcrypt");
const { createToken } = require("../utiles/tokenCreate");
const adminModel = require("../models/adminModel");
const sellerModel = require("../models/sellerModel");
const sellerCustomerModel = require("../models/chat/sellerCustomerModel");
const cloudinary = require("cloudinary").v2;
const authControllers = require("../controllers/authControllers");
const { createRes } = require("./testHelpers");

describe("authControllers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.mode = "test";
  });

  test("logs in admin and seller users", async () => {
    adminModel.findOne.mockReturnValue({
      select: jest.fn().mockResolvedValue({ id: "admin-1", role: "admin", password: "hashed" }),
    });
    sellerModel.findOne.mockReturnValue({
      select: jest.fn().mockResolvedValue({ id: "seller-1", role: "seller", password: "hashed" }),
    });
    bcrypt.compare.mockResolvedValue(true);
    createToken.mockResolvedValue("token-1");

    const adminRes = createRes();
    const sellerRes = createRes();

    await authControllers.admin_login({ body: { email: "admin@example.com", password: "secret" } }, adminRes);
    await authControllers.seller_login({ body: { email: "seller@example.com", password: "secret" } }, sellerRes);

    expect(adminRes.status).toHaveBeenCalledWith(200);
    expect(sellerRes.status).toHaveBeenCalledWith(200);
  });

  test("handles failed admin and seller login paths", async () => {
    adminModel.findOne.mockReturnValue({
      select: jest.fn().mockResolvedValue({ id: "admin-1", role: "admin", password: "hashed" }),
    });
    sellerModel.findOne.mockReturnValue({
      select: jest.fn().mockResolvedValue(null),
    });
    bcrypt.compare.mockResolvedValue(false);

    const adminRes = createRes();
    const sellerRes = createRes();

    await authControllers.admin_login({ body: { email: "admin@example.com", password: "wrong" } }, adminRes);
    await authControllers.seller_login({ body: { email: "missing@example.com", password: "secret" } }, sellerRes);

    expect(adminRes.status).toHaveBeenCalledWith(404);
    expect(sellerRes.status).toHaveBeenCalledWith(404);
  });

  test("registers a seller and creates a chat row", async () => {
    sellerModel.findOne.mockResolvedValue(null);
    sellerModel.create.mockResolvedValue({ id: "seller-1", role: "seller" });
    sellerCustomerModel.create.mockResolvedValue({});
    bcrypt.hash.mockResolvedValue("hashed-password");
    createToken.mockResolvedValue("token-1");

    const res = createRes();
    await authControllers.seller_register({ body: { name: "Alice", email: "seller@example.com", password: "secret" } }, res);

    expect(sellerCustomerModel.create).toHaveBeenCalledWith({ myId: "seller-1" });
    expect(res.status).toHaveBeenCalledWith(201);
  });

  test("rejects duplicate seller registration", async () => {
    sellerModel.findOne.mockResolvedValue({ id: "seller-1" });

    const res = createRes();
    await authControllers.seller_register({ body: { name: "Alice", email: "seller@example.com", password: "secret" } }, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  test("gets user info for admin and seller", async () => {
    adminModel.findById.mockResolvedValue({ role: "admin" });
    sellerModel.findById.mockResolvedValue({ role: "seller" });

    const adminRes = createRes();
    const sellerRes = createRes();

    await authControllers.getUser({ id: "admin-1", role: "admin" }, adminRes);
    await authControllers.getUser({ id: "seller-1", role: "seller" }, sellerRes);

    expect(adminRes.status).toHaveBeenCalledWith(200);
    expect(sellerRes.status).toHaveBeenCalledWith(200);
  });

  test("updates seller profile info and user info", async () => {
    sellerModel.findByIdAndUpdate.mockResolvedValue({});
    sellerModel.findById.mockResolvedValue({ id: "seller-1" });
    sellerModel.findOne.mockResolvedValue(null);

    const res = createRes();
    await authControllers.profile_info_add({ id: "seller-1", body: { division: "Dhaka", district: "Dhaka", shopName: "Shop", sub_district: "Center" } }, res);
    await authControllers.profile_user_info_update({ id: "seller-1", body: { name: "New Name", email: "new@example.com" } }, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test("rejects profile update when email exists", async () => {
    sellerModel.findOne.mockResolvedValue({ id: "other-seller" });

    const res = createRes();
    await authControllers.profile_user_info_update(
      { id: "seller-1", body: { name: "New Name", email: "taken@example.com" } },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(400);
  });

  test("uploads profile image and logs out", async () => {
    const parse = jest.fn((req, callback) => callback(null, {}, { image: { filepath: "/tmp/image.png" } }));
    formidable.mockReturnValue({ parse });
    cloudinary.uploader.upload.mockResolvedValue({ url: "https://cdn.example/profile.png" });
    sellerModel.findByIdAndUpdate.mockResolvedValue({});
    sellerModel.findById.mockResolvedValue({ id: "seller-1" });

    const res = createRes();
    await authControllers.profile_image_upload({ id: "seller-1" }, res);
    await authControllers.logout({}, res);

    expect(res.status).toHaveBeenCalledWith(200);
  });

  test("changes password", async () => {
    const save = jest.fn();
    sellerModel.findOne.mockReturnValue({
      select: jest.fn().mockResolvedValue({ password: "hashed", save }),
    });
    bcrypt.compare.mockResolvedValue(true);
    bcrypt.hash.mockResolvedValue("new-hash");

    const res = createRes();
    await authControllers.change_password({ body: { email: "seller@example.com", old_password: "old", new_password: "new" } }, res);

    expect(save).toHaveBeenCalled();
  });

  test("handles failed password change branches", async () => {
    sellerModel.findOne.mockReturnValueOnce({
      select: jest.fn().mockResolvedValue(null),
    });
    sellerModel.findOne.mockReturnValueOnce({
      select: jest.fn().mockResolvedValue({ password: "hashed" }),
    });
    bcrypt.compare.mockResolvedValue(false);

    const resMissing = createRes();
    await authControllers.change_password(
      { body: { email: "missing@example.com", old_password: "old", new_password: "new" } },
      resMissing,
    );

    const resWrongOld = createRes();
    await authControllers.change_password(
      { body: { email: "seller@example.com", old_password: "wrong", new_password: "new" } },
      resWrongOld,
    );

    expect(resMissing.status).toHaveBeenCalledWith(404);
    expect(resWrongOld.status).toHaveBeenCalledWith(400);
  });
});