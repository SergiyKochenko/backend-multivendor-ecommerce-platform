jest.mock("../models/sellerModel", () => ({
  find: jest.fn(),
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
}));

const sellerModel = require("../models/sellerModel");
const sellerController = require("../controllers/dashboard/sellerController");
const { createRes, createQueryChain } = require("./testHelpers");

describe("sellerController", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("returns pending sellers and updates seller status", async () => {
    sellerModel.find.mockImplementation(() =>
      createQueryChain([{ id: 1 }], { countDocuments: jest.fn().mockResolvedValue(1) }),
    );
    sellerModel.findById.mockResolvedValue({ id: "seller-1" });
    sellerModel.findByIdAndUpdate.mockResolvedValue({});

    const pendingRes = createRes();
    await sellerController.request_seller_get({ query: { page: "1", parPage: "10" } }, pendingRes);

    const getRes = createRes();
    await sellerController.get_seller({ params: { sellerId: "seller-1" } }, getRes);

    const updateRes = createRes();
    await sellerController.seller_status_update({ body: { sellerId: "seller-1", status: "active" } }, updateRes);

    const activeRes = createRes();
    await sellerController.get_active_sellers({ query: { page: "1", parPage: "10" } }, activeRes);

    const deactiveRes = createRes();
    await sellerController.get_deactive_sellers({ query: { page: "1", parPage: "10" } }, deactiveRes);

    expect(pendingRes.status).toHaveBeenCalledWith(200);
    expect(getRes.status).toHaveBeenCalledWith(200);
    expect(updateRes.status).toHaveBeenCalledWith(200);
    expect(activeRes.status).toHaveBeenCalledWith(200);
    expect(deactiveRes.status).toHaveBeenCalledWith(200);
  });
});