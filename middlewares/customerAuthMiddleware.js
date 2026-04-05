const jwt = require("jsonwebtoken");

module.exports.customerAuthMiddleware = async (req, res, next) => {
  const { customerToken } = req.cookies;
  const authHeader = req.headers.authorization || "";
  const bearerToken = authHeader.startsWith("Bearer ")
    ? authHeader.split(" ")[1]
    : null;
  const token = customerToken || bearerToken;

  if (!token) {
    return res.status(409).json({ error: "Please Login First" });
  }

  try {
    const deCodeToken = await jwt.verify(token, process.env.SECRET);
    req.id = deCodeToken.id;
    next();
  } catch (error) {
    return res.status(409).json({ error: "Please Login" });
  }
};