const customerAuthController = require("../../controllers/home/customerAuthController");
const { customerAuthMiddleware } = require("../../middlewares/customerAuthMiddleware");
const router = require("express").Router();

router.post(
  "/customer/customer-register",
  customerAuthController.customer_register,
);
router.post("/customer/customer-login", customerAuthController.customer_login);
router.post(
  "/customer/change-password",
  customerAuthMiddleware,
  customerAuthController.change_password,
);
router.get("/customer/logout", customerAuthController.customer_logout);

module.exports = router;
