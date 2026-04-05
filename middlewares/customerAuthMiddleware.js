const jwt = require("jsonwebtoken");

module.exports.customerAuthMiddleware = async (req, res, next) => {
  const { customerToken } = req.cookies;

  if (!customerToken) {
    return res.status(409).json({ error: "Please Login First" });
  }

  try {
    const deCodeToken = await jwt.verify(customerToken, process.env.SECRET);
    req.id = deCodeToken.id;
    next();
  } catch (error) {
    return res.status(409).json({ error: "Please Login" });
  }
};