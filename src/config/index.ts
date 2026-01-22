/** @format */

import dotenv from "dotenv";
dotenv.config();

export const config = {
  mongodb: {
    uri: process.env.MONGODB_URI || "",
  },
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || "",
    apiKey: process.env.CLOUDINARY_API_KEY || "",
    apiSecret: process.env.CLOUDINARY_API_SECRET || "",
  },
  server: {
    port: parseInt(process.env.PORT || "5000", 10),
    nodeEnv: process.env.NODE_ENV || "development",
  },
  cors: {
    origin: "*",
  },
  jwt: {
    accessSecret:
      process.env.JWT_ACCESS_SECRET || "notu-access-secret-key-2024",
    refreshSecret:
      process.env.JWT_REFRESH_SECRET || "notu-refresh-secret-key-2024",
    accessExpiry: "15m",
    refreshExpiry: "2d",
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || "",
  },
};
