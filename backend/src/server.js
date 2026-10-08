const express = require("express");
const cors = require("cors");
require("dotenv").config({ path: require("node:path").resolve(__dirname, "../.env"), quiet: true });

const app = express();

app.use(cors({ origin: process.env.CLIENT_ORIGIN || "http://localhost:5173" }));
app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Smart Campus Event Management API is running"
  });
});

app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/events", require("./routes/eventRoutes"));
app.use("/api/registrations", require("./routes/registrationRoutes"));

app.use((req, res) => res.status(404).json({ success: false, message: "Route not found" }));
app.use((error, req, res, next) => {
  if (error.code === "ER_DUP_ENTRY") return res.status(409).json({ success: false, message: "Email, student ID, or event registration already exists" });
  if (error.type === "entity.parse.failed") return res.status(400).json({ success: false, message: "Invalid JSON body" });
  if (error.type === "entity.too.large") return res.status(413).json({ success: false, message: "Request body is too large" });
  if (error.status && error.status >= 400 && error.status < 500) return res.status(error.status).json({ success: false, message: error.message });
  console.error("Request failed:", error.code || "INTERNAL_ERROR");
  res.status(500).json({ success: false, message: "Internal server error" });
});

if (require.main === module) {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET === "replace-with-a-random-secret") {
    console.error("Set JWT_SECRET in backend/.env before starting the API.");
    process.exit(1);
  }
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

module.exports = app;
