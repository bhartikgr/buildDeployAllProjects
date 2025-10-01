const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const http = require("http");
const path = require("path");

//User
const UserSponserRoutes = require("./routes/user/sponser");
const UserProposalAgentRoutes = require("./routes/user/proposalAgent");
const UserVendorbrowserRoutes = require("./routes/user/vendorbrowser");
const UserEventsRoutes = require("./routes/user/events");
const UserHostRoutes = require("./routes/user/host");
//User

//Admin
const DashboardRoutes = require("./routes/admin/dashboard");
//Admin
dotenv.config();

const app = express();
const server = http.createServer(app);
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Middleware
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

//User Routes
app.use("/api/proposalAgent/", UserProposalAgentRoutes);
app.use("/api/sponser/", UserSponserRoutes);
app.use("/api/vendorbrowser/", UserVendorbrowserRoutes);
app.use("/api/events/", UserEventsRoutes);
app.use("/api/hosts/", UserHostRoutes);
//User Routes

//Admin Routes
app.use("/api/admin/", DashboardRoutes);
//Admin Routes

// Start server
server.listen(process.env.PORT || 5000, () => {
  console.log(`Server running on port ${process.env.PORT || 5000}`);
});
server.setTimeout(600000);
