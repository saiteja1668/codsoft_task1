require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(helmet());
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:5173'], // Add your local port here (React uses 3000 or Vite uses 5173)
  credentials: true
}));
app.use(express.json());

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
