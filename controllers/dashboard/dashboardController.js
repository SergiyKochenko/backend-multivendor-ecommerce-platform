const { responseReturn } = require("../../utiles/response");
const myShopWallet = require("../../models/myShopWallet");
const productModel = require("../../models/productModel");
const customerOrder = require("../../models/customerOrder");
const sellerModel = require("../../models/sellerModel");
const adminSellerMessage = require("../../models/chat/adminSellerMessage");
const sellerWallet = require("../../models/sellerWallet");
const authOrder = require("../../models/authOrder");
const sellerCustomerMessage = require("../../models/chat/sellerCustomerMessage");
const bannerModel = require("../../models/bannerModel");
const {
  mongo: { ObjectId },
} = require("mongoose");
const formidable = require("formidable");
const {
  createMediaKey,
  deleteMedia,
  uploadMedia,
} = require("../../services/mediaStorage");
const { deleteMediaIfUnreferenced } = require("../../services/mediaReferences");

class dashboardController {
  get_admin_dashboard_data = async (req, res) => {
    const { year } = req.query;
    const targetYear = Number.parseInt(year, 10) || new Date().getFullYear();
    try {
      const monthlyTemplate = () => new Array(12).fill(0);

      // Aggregate total sale by month (current year) from wallet
      const revenueAgg = await myShopWallet.aggregate([
        {
          $match: {
            year: targetYear,
          },
        },
        {
          $group: {
            _id: "$month",
            total: { $sum: "$amount" },
          },
        },
      ]);

      const monthlyRevenue = monthlyTemplate();
      revenueAgg.forEach((item) => {
        if (item._id >= 1 && item._id <= 12) monthlyRevenue[item._id - 1] = item.total;
      });

      // Aggregate orders by month (current year)
      const orderAgg = await customerOrder.aggregate([
        {
          $match: {
            createdAt: {
              $gte: new Date(`${targetYear}-01-01T00:00:00.000Z`),
              $lt: new Date(`${targetYear + 1}-01-01T00:00:00.000Z`),
            },
          },
        },
        {
          $group: {
            _id: { $month: "$createdAt" },
            total: { $sum: 1 },
          },
        },
      ]);

      const monthlyOrders = monthlyTemplate();
      orderAgg.forEach((item) => {
        if (item._id >= 1 && item._id <= 12) monthlyOrders[item._id - 1] = item.total;
      });

      // Aggregate seller registrations by month (current year)
      const sellerAgg = await sellerModel.aggregate([
        {
          $match: {
            createdAt: {
              $gte: new Date(`${targetYear}-01-01T00:00:00.000Z`),
              $lt: new Date(`${targetYear + 1}-01-01T00:00:00.000Z`),
            },
          },
        },
        {
          $group: {
            _id: { $month: "$createdAt" },
            total: { $sum: 1 },
          },
        },
      ]);

      const monthlySellers = monthlyTemplate();
      sellerAgg.forEach((item) => {
        if (item._id >= 1 && item._id <= 12) monthlySellers[item._id - 1] = item.total;
      });

      const totalSale = await myShopWallet.aggregate([
        {
          $group: {
            _id: null,
            totalAmount: { $sum: "$amount" },
          },
        },
      ]);
      const totalProduct = await productModel.find({}).countDocuments();
      const totalOrder = await customerOrder.find({}).countDocuments();
      const totalSeller = await sellerModel.find({}).countDocuments();
      const messages = await adminSellerMessage.find({}).limit(3);
      const recentOrders = await customerOrder.find({}).limit(5);
      responseReturn(res, 200, {
        totalProduct,
        totalOrder,
        totalSeller,
        messages,
        recentOrders,
        chart: {
          orders: monthlyOrders,
          revenue: monthlyRevenue,
          sellers: monthlySellers,
        },
        totalSale: totalSale.length > 0 ? totalSale[0].totalAmount : 0,
      });
    } catch (error) {
      console.log(error.message);
    }
  };
  //end Method

  get_seller_dashboard_data = async (req, res) => {
    const { id } = req;
    const { year } = req.query;
    const targetYear = Number.parseInt(year, 10) || new Date().getFullYear();
    try {
      const monthlyTemplate = () => new Array(12).fill(0);

      // Monthly revenue from seller wallet (current year)
      const revenueAgg = await sellerWallet.aggregate([
        {
          $match: {
            sellerId: {
              $eq: id,
            },
            year: targetYear,
          },
        },
        {
          $group: {
            _id: "$month",
            total: { $sum: "$amount" },
          },
        },
      ]);

      const monthlyRevenue = monthlyTemplate();
      revenueAgg.forEach((item) => {
        if (item._id >= 1 && item._id <= 12) monthlyRevenue[item._id - 1] = item.total;
      });

      // Monthly orders count (current year)
      const orderAgg = await authOrder.aggregate([
        {
          $match: {
            sellerId: new ObjectId(id),
            createdAt: {
              $gte: new Date(`${targetYear}-01-01T00:00:00.000Z`),
              $lt: new Date(`${targetYear + 1}-01-01T00:00:00.000Z`),
            },
          },
        },
        {
          $group: {
            _id: { $month: "$createdAt" },
            total: { $sum: 1 },
          },
        },
      ]);

      const monthlyOrders = monthlyTemplate();
      orderAgg.forEach((item) => {
        if (item._id >= 1 && item._id <= 12) monthlyOrders[item._id - 1] = item.total;
      });

      // Monthly sales volume (products count) per month
      const salesAgg = await authOrder.aggregate([
        {
          $match: {
            sellerId: new ObjectId(id),
            createdAt: {
              $gte: new Date(`${targetYear}-01-01T00:00:00.000Z`),
              $lt: new Date(`${targetYear + 1}-01-01T00:00:00.000Z`),
            },
          },
        },
        {
          $project: {
            month: { $month: "$createdAt" },
            productCount: { $size: "$products" },
          },
        },
        {
          $group: {
            _id: "$month",
            total: { $sum: "$productCount" },
          },
        },
      ]);

      const monthlySales = monthlyTemplate();
      salesAgg.forEach((item) => {
        if (item._id >= 1 && item._id <= 12) monthlySales[item._id - 1] = item.total;
      });

      const totalSale = await sellerWallet.aggregate([
        {
          $match: {
            sellerId: {
              $eq: id,
            },
          },
        },
        {
          $group: {
            _id: null,
            totalAmount: { $sum: "$amount" },
          },
        },
      ]);

      const totalProduct = await productModel
        .find({
          sellerId: new ObjectId(id),
        })
        .countDocuments();

      const totalOrder = await authOrder
        .find({
          sellerId: new ObjectId(id),
        })
        .countDocuments();

      const totalPendingOrder = await authOrder
        .find({
          $and: [
            {
              sellerId: {
                $eq: new ObjectId(id),
              },
            },
            {
              delivery_status: {
                $eq: "pending",
              },
            },
          ],
        })
        .countDocuments();
      const messages = await sellerCustomerMessage
        .find({
          $or: [
            {
              senderId: {
                $eq: id,
              },
            },
            {
              receverId: {
                $eq: id,
              },
            },
          ],
        })
        .limit(3);

      const recentOrders = await authOrder
        .find({
          sellerId: new ObjectId(id),
        })
        .limit(5);

      responseReturn(res, 200, {
        totalProduct,
        totalOrder,
        totalPendingOrder,
        messages,
        recentOrders,
        chart: {
          orders: monthlyOrders,
          revenue: monthlyRevenue,
          sales: monthlySales,
        },
        totalSale: totalSale.length > 0 ? totalSale[0].totalAmount : 0,
      });
    } catch (error) {
      console.log(error.message);
    }
  };
  //end Method

  add_banner = async (req, res) => {
    const form = formidable({ multiples: true });
    form.parse(req, async (err, field, files) => {
      if (err) {
        return responseReturn(res, 400, { error: err.message });
      }

      const { productId } = field;
      const rawMainBanner = files?.mainban;
      const mainban = Array.isArray(rawMainBanner)
        ? rawMainBanner[0]
        : rawMainBanner;

      try {
        if (!mainban?.filepath) {
          return responseReturn(res, 400, { error: "Banner image is required" });
        }
        const { slug } = await productModel.findById(productId);
        const result = await uploadMedia(
          mainban,
          "banners",
          createMediaKey("banners", productId, mainban),
        );
        let banner;
        try {
          banner = await bannerModel.create({
            productId,
            banner: result.url,
            link: slug,
          });
        } catch (databaseError) {
          await deleteMedia(result.url);
          throw databaseError;
        }
        responseReturn(res, 200, { banner, message: "Banner Add Success" });
      } catch (error) {
        responseReturn(res, 500, { error: error.message });
      }
    });
  };
  //end Method

  get_banner = async (req, res) => {
    const { productId } = req.params;
    try {
      const banner = await bannerModel.findOne({
        productId: new ObjectId(productId),
      });
      responseReturn(res, 200, { banner });
    } catch (error) {
      responseReturn(res, 500, { error: error.message });
    }
  };
  //end Method

  update_banner = async (req, res) => {
    const { bannerId } = req.params;
    const form = formidable({});

    form.parse(req, async (err, _, files) => {
      if (err) {
        return responseReturn(res, 400, { error: err.message });
      }

      const rawMainBanner = files?.mainban;
      const mainban = Array.isArray(rawMainBanner)
        ? rawMainBanner[0]
        : rawMainBanner;

      try {
        if (!mainban?.filepath) {
          return responseReturn(res, 400, { error: "Banner image is required" });
        }
        let banner = await bannerModel.findById(bannerId);
        if (!banner) {
          return responseReturn(res, 404, { error: "Banner not found" });
        }

        const previousBannerUrl = banner.banner;
        const { url } = await uploadMedia(
          mainban,
          "banners",
          createMediaKey("banners", bannerId, mainban),
        );

        try {
          await bannerModel.findByIdAndUpdate(bannerId, {
            banner: url,
          });
        } catch (databaseError) {
          await deleteMedia(url);
          throw databaseError;
        }
        try {
          await deleteMediaIfUnreferenced(previousBannerUrl);
        } catch (cleanupError) {
          console.error("Unable to clean up the previous banner image:", cleanupError.message);
        }

        banner = await bannerModel.findById(bannerId);
        responseReturn(res, 200, { banner, message: "Banner Updated Success" });
      } catch (error) {
        responseReturn(res, 500, { error: error.message });
      }
    });
  };
  //end Method

  get_banners = async (req, res) => {
    try {
      const banners = await bannerModel.aggregate([
        {
          $sample: {
            size: 5,
          },
        },
      ]);
      responseReturn(res, 200, { banners });
    } catch (error) {
      responseReturn(res, 500, { error: error.message });
    }
  };
  //end Method
}
module.exports = new dashboardController();
