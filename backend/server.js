require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

const app = express();
const PORT = process.env.PORT || 5000;

const AWS = require("aws-sdk");
const s3 = new AWS.S3({
  region: process.env.AWS_REGION,
  accesskeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});
const AWS_S3_BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME;

app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }));
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:5173'], // Add your local port here (React uses 3000 or Vite uses 5173)
  credentials: true
}));
app.use(express.json());

app.get("/api/files", async (req, res, next) => { 
  try { 
    const result = await s3 
      .listObjectsV2({ 
        Bucket: AWS_S3_BUCKET_NAME, 
        Prefix: "uploads/", 
        MaxKeys: 1000 
      }) 
      .promise(); 
    const files = (result.Contents || []).map((file) => ({ 
      key: file.Key, 
      name: file.Key.split("/").pop(), 
      size: file.Size, 
      lastModified: file.LastModified 
    })); 
    res.json({ files });
  } catch (error) { 
    next(error); 
  } 
}); 

app.get("/", (req, res) => {
  res.json({
    message: "Cloud File Manager backend is running",
    status: "ok"
  });
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
