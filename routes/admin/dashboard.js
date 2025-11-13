const express = require("express");
const router = express.Router();
const DashboardController = require("../../controllers/admin/DashboardController");

// Define the POST /login route
router.post("/getusers", DashboardController.getusers);
router.post("/getevents", DashboardController.getevents);
router.post("/deleteevent", DashboardController.deleteevent);
router.post("/deleteuser", DashboardController.deleteuser);

router.post("/getinvoices", DashboardController.getinvoices);
router.post("/getuserdetail", DashboardController.getuserdetail);
router.post("/getsponserpayments", DashboardController.getsponpays);
router.post("/gethostpayments", DashboardController.gethostpayments);
router.post("/pay-to-host", DashboardController.paytohost);
router.post("/create-paypal-order", DashboardController.createpaypalorder);
router.post("/capture-paypal-order", DashboardController.capturePaypalOrder);
router.post("/updaterole", DashboardController.updaterole);

router.post("/send-email", DashboardController.notifyuser);

router.post(
  "/create_transfer_ToHost_Stripe",
  DashboardController.create_transfer_ToHost_Stripe
);
router.post("/Stripetransfers", DashboardController.Stripetransfers);
router.post("/Stripepayouts", DashboardController.Stripepayouts);

router.post("/broadcast-email", DashboardController.sendBroadcastEmail);
router.get("/broadcast-emails", DashboardController.getBroadcastEmails);
router.get("/email-stats", DashboardController.getEmailStats);

// User Routes for Broadcasting
router.get("/users-by-role/:role", DashboardController.getUsersByRole);
router.get("/user-counts", DashboardController.getUserCounts);
module.exports = router;
