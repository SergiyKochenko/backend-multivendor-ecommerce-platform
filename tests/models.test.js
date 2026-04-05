const models = [
  ["adminModel", "../models/adminModel"],
  ["authOrder", "../models/authOrder"],
  ["bannerModel", "../models/bannerModel"],
  ["cardModel", "../models/cardModel"],
  ["categoryModel", "../models/categoryModel"],
  ["customerModel", "../models/customerModel"],
  ["customerOrder", "../models/customerOrder"],
  ["myShopWallet", "../models/myShopWallet"],
  ["productModel", "../models/productModel"],
  ["reviewModel", "../models/reviewModel"],
  ["sellerModel", "../models/sellerModel"],
  ["sellerWallet", "../models/sellerWallet"],
  ["stripeModel", "../models/stripeModel"],
  ["wishlistModel", "../models/wishlistModel"],
  ["withdrowRequest", "../models/withdrowRequest"],
  ["adminSellerMessage", "../models/chat/adminSellerMessage"],
  ["sellerCustomerMessage", "../models/chat/sellerCustomerMessage"],
  ["sellerCustomerModel", "../models/chat/sellerCustomerModel"],
];

describe("mongoose models", () => {
  test.each(models)("loads %s", (_, path) => {
    const model = require(path);

    expect(model).toBeDefined();
    expect(model.modelName).toBeTruthy();
  });
});