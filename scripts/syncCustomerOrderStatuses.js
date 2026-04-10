require("dotenv").config();

const mongoose = require("mongoose");
const { dbConnect } = require("../utiles/db");
const authOrderModel = require("../models/authOrder");
const customerOrder = require("../models/customerOrder");

const resolveCustomerStatusFromSellerStatuses = (statuses = []) => {
  const uniqueStatuses = [...new Set(statuses.filter(Boolean))];

  if (uniqueStatuses.length === 0) {
    return "pending";
  }

  if (uniqueStatuses.length === 1) {
    return uniqueStatuses[0];
  }

  const allCompletedOrClosed = uniqueStatuses.every((status) =>
    ["delivered", "cancelled", "returned"].includes(status),
  );

  if (allCompletedOrClosed) {
    if (uniqueStatuses.includes("delivered")) return "delivered";
    if (uniqueStatuses.includes("returned")) return "returned";
    return "cancelled";
  }

  const progressOrder = [
    "pending",
    "placed",
    "warehouse",
    "processing",
    "shipped",
    "delivered",
  ];

  for (const candidate of progressOrder) {
    if (uniqueStatuses.includes(candidate)) {
      return candidate;
    }
  }

  return "processing";
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
        ? await customerOrder.find({ _id: { $in: targetOrderIds } }, { _id: 1, delivery_status: 1 })
        : await customerOrder.find({}, { _id: 1, delivery_status: 1 });

    let processed = 0;
    let updated = 0;
    let skippedNoSuborders = 0;

    for (const item of customerOrders) {
      processed += 1;

      const suborders = await authOrderModel.find(
        { orderId: item._id },
        { delivery_status: 1 },
      );

      if (!suborders.length) {
        skippedNoSuborders += 1;
        continue;
      }

      const derivedStatus = resolveCustomerStatusFromSellerStatuses(
        suborders.map((suborder) => suborder.delivery_status),
      );

      if (item.delivery_status !== derivedStatus) {
        await customerOrder.findByIdAndUpdate(item._id, {
          delivery_status: derivedStatus,
        });
        updated += 1;
        console.log(
          `Synced customer order ${item._id}: ${item.delivery_status} -> ${derivedStatus}`,
        );
      }
    }

    console.log(
      `Sync complete. Processed: ${processed}, updated: ${updated}, skipped (no suborders): ${skippedNoSuborders}`,
    );
  } catch (error) {
    console.error("Order status sync failed:", error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
  }
};

syncCustomerOrderStatuses();
