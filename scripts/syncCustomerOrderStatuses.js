require("dotenv").config();

const mongoose = require("mongoose");
const { dbConnect } = require("../utiles/db");
const authOrderModel = require("../models/authOrder");
const customerOrder = require("../models/customerOrder");

const resolveCanonicalStatus = ({ customerPaymentStatus, suborders = [] }) => {
  if (customerPaymentStatus === "unpaid") {
    return "cancelled";
  }

  if (!suborders.length) {
    return customerPaymentStatus === "paid" ? "processing" : "pending";
  }

  const sortedByLastUpdate = [...suborders].sort(
    (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt),
  );

  const lastSellerStatus = sortedByLastUpdate[0].delivery_status || "pending";

  if (customerPaymentStatus === "paid" && lastSellerStatus === "cancelled") {
    return "pending";
  }

  return lastSellerStatus;
};

const parseOrderIdsArg = () => {
  const rawArg = process.argv.find((arg) => arg.startsWith("--orderIds="));
  if (!rawArg) {
    return [];
  }

  return rawArg
    .replace("--orderIds=", "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
};

const syncCustomerOrderStatuses = async () => {
  await dbConnect();

  try {
    const targetOrderIds = parseOrderIdsArg();

    const customerOrders =
      targetOrderIds.length > 0
        ? await customerOrder.find(
            { _id: { $in: targetOrderIds } },
            { _id: 1, delivery_status: 1, payment_status: 1 },
          )
        : await customerOrder.find({}, { _id: 1, delivery_status: 1, payment_status: 1 });

    let processed = 0;
    let syncedOrders = 0;
    let customerOrdersUpdated = 0;
    let sellerRowsUpdated = 0;
    let skippedNoSuborders = 0;

    for (const item of customerOrders) {
      processed += 1;

      const suborders = await authOrderModel.find(
        { orderId: item._id },
        { delivery_status: 1, updatedAt: 1 },
      );

      if (!suborders.length) {
        skippedNoSuborders += 1;
        continue;
      }

      const canonicalStatus = resolveCanonicalStatus({
        customerPaymentStatus: item.payment_status,
        suborders,
      });

      const sellerResult = await authOrderModel.updateMany(
        {
          orderId: item._id,
          delivery_status: { $ne: canonicalStatus },
        },
        {
          delivery_status: canonicalStatus,
        },
      );

      sellerRowsUpdated += sellerResult.modifiedCount || 0;

      let customerUpdated = false;
      if (item.delivery_status !== canonicalStatus) {
        await customerOrder.findByIdAndUpdate(item._id, {
          delivery_status: canonicalStatus,
        });
        customerOrdersUpdated += 1;
        customerUpdated = true;
      }

      if ((sellerResult.modifiedCount || 0) > 0 || customerUpdated) {
        syncedOrders += 1;
        console.log(
          `Synced order ${item._id}: customer ${item.delivery_status} -> ${canonicalStatus}, seller rows updated: ${sellerResult.modifiedCount || 0}`,
        );
      }
    }

    console.log(
      `Sync complete. Processed: ${processed}, synced orders: ${syncedOrders}, customer orders updated: ${customerOrdersUpdated}, seller rows updated: ${sellerRowsUpdated}, skipped (no suborders): ${skippedNoSuborders}`,
    );
  } catch (error) {
    console.error("Order status sync failed:", error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
  }
};

syncCustomerOrderStatuses();
