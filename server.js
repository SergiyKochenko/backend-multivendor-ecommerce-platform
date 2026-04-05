require("dotenv").config();

const { app, allowedOrigins } = require("./app");
const { dbConnect } = require("./utiles/db");
const socket = require("socket.io");
const http = require("http");

let allCustomer = [];
let allSeller = [];
let admin = {};

const addUser = (customerId, socketId, userInfo) => {
  const checkUser = allCustomer.some((u) => u.customerId === customerId);
  if (!checkUser) {
    allCustomer.push({
      customerId,
      socketId,
      userInfo,
    });
  }
};

const addSeller = (sellerId, socketId, userInfo) => {
  const checkSeller = allSeller.some((u) => u.sellerId === sellerId);
  if (!checkSeller) {
    allSeller.push({
      sellerId,
      socketId,
      userInfo,
    });
  }
};

const findCustomer = (customerId) => {
  return allCustomer.find((c) => c.customerId === customerId);
};
const findSeller = (sellerId) => {
  return allSeller.find((c) => c.sellerId === sellerId);
};

const remove = (socketId) => {
  allCustomer = allCustomer.filter((c) => c.socketId !== socketId);
  allSeller = allSeller.filter((c) => c.socketId !== socketId);
};

const registerSocketHandlers = (io) => {
  io.on("connection", (soc) => {
    console.log("socket server running..");

    soc.on("add_user", (customerId, userInfo) => {
      addUser(customerId, soc.id, userInfo);
      io.emit("activeSeller", allSeller);
    });
    soc.on("add_seller", (sellerId, userInfo) => {
      addSeller(sellerId, soc.id, userInfo);
      io.emit("activeSeller", allSeller);
    });
    soc.on("send_seller_message", (msg) => {
      const customer = findCustomer(msg.receverId);
      if (customer !== undefined) {
        soc.to(customer.socketId).emit("seller_message", msg);
      }
    });
    soc.on("send_customer_message", (msg) => {
      const seller = findSeller(msg.receverId);
      if (seller !== undefined) {
        soc.to(seller.socketId).emit("customer_message", msg);
      }
    });

    soc.on("send_message_admin_to_seller", (msg) => {
      const seller = findSeller(msg.receverId);
      if (seller !== undefined) {
        soc.to(seller.socketId).emit("receved_admin_message", msg);
      }
    });

    soc.on("send_message_seller_to_admin", (msg) => {
      if (admin.socketId) {
        soc.to(admin.socketId).emit("receved_seller_message", msg);
      }
    });

    soc.on("add_admin", (adminInfo) => {
      delete adminInfo.email;
      delete adminInfo.password;
      admin = adminInfo;
      admin.socketId = soc.id;
      io.emit("activeSeller", allSeller);
    });

    soc.on("disconnect", () => {
      console.log("user disconnect");
      remove(soc.id);
      io.emit("activeSeller", allSeller);
    });
  });
};

const createServer = () => {
  const server = http.createServer(app);
  const io = socket(server, {
    cors: {
      origin: allowedOrigins,
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  registerSocketHandlers(io);
  return { server, io };
};

const startServer = () => {
  const { server } = createServer();
  const port = process.env.PORT || 5000;
  dbConnect();
  server.listen(port, () => console.log(`Server is running on port ${port}`));
  return server;
};

if (require.main === module) {
  startServer();
}

module.exports = {
  app,
  createServer,
  startServer,
  registerSocketHandlers,
};
