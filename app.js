require('dotenv').config();

const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");

const app = express();

const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  "https://frontend-multivendor-ecommerce-platform.onrender.com",
  "https://dashboard-multivendor-ecommerce-platform.onrender.com",
];

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  }),
);

app.use(bodyParser.json());
app.use(cookieParser());

app.use("/api/home", require("./routes/home/homeRoutes"));
app.use("/api", require("./routes/authRoutes"));
app.use("/api", require("./routes/order/orderRoutes"));
app.use("/api", require("./routes/home/cardRoutes"));
app.use("/api", require("./routes/dashboard/categoryRoutes"));
app.use("/api", require("./routes/dashboard/productRoutes"));
app.use("/api", require("./routes/dashboard/sellerRoutes"));
app.use("/api", require("./routes/home/customerAuthRoutes"));
app.use("/api", require("./routes/chatRoutes"));
app.use("/api", require("./routes/paymentRoutes"));
app.use("/api", require("./routes/dashboard/dashboardRoutes"));

app.get("/", (req, res) => res.send("Hello Server"));

module.exports = { app, allowedOrigins };