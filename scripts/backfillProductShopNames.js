require("dotenv").config();

const mongoose = require("mongoose");
const { dbConnect } = require("../utiles/db");
const sellerModel = require("../models/sellerModel");
const productModel = require("../models/productModel");

const backfillProductShopNames = async () => {
  await dbConnect();

  try {
    const sellers = await sellerModel.find({}, { _id: 1, shopInfo: 1 });
    let sellersProcessed = 0;
    let productsMatched = 0;
    let productsUpdated = 0;

    for (const seller of sellers) {
      const sellerId = seller?._id;
      const shopName = seller?.shopInfo?.shopName?.trim();

      if (!sellerId || !shopName) {
        continue;
      }

      sellersProcessed += 1;

      const result = await productModel.updateMany(
        { sellerId },
        { $set: { shopName } },
      );

      productsMatched += result.matchedCount || 0;
      productsUpdated += result.modifiedCount || 0;
    }

    console.log(
      `Backfill complete. Sellers processed: ${sellersProcessed}, products matched: ${productsMatched}, products updated: ${productsUpdated}`,
    );
  } catch (error) {
    console.error("Backfill failed:", error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
  }
};

backfillProductShopNames();
