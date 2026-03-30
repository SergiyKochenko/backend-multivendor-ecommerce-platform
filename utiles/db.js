const mongoose = require("mongoose");

module.exports.dbConnect = async () => {
  try {
    // console.log('DEBUG: process.env.mode =', process.env.mode);
    if (process.env.mode === 'pro') {
      // console.log('DEBUG: Using DB_PRO_URL =', process.env.DB_PRO_URL);
      await mongoose.connect(process.env.DB_PRO_URL);
      console.log("Production Database connected..");
    } else {
      // console.log('DEBUG: Using DB_LOCAL_URL =', process.env.DB_LOCAL_URL);
      await mongoose.connect(process.env.DB_LOCAL_URL);
      console.log("Local Database connected..");
    }
  } catch (error) {
    console.log(error.message);
  }
};
