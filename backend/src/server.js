const express = require("express");
const cors = require("cors");
require("dotenv").config({ path: require("node:path").resolve(__dirname, "../.env") });

const app = express();

app.use(cors({ origin: process.env.CLIENT_ORIGIN || "http://localhost:5173" }));
app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    message: "Smart Campus Event Management API is running"
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
