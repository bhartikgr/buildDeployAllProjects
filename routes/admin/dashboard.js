const express = require("express");
const router = express.Router();
const DashboardController = require("../../controllers/admin/DashboardController");

// Define the POST /login route
router.post("/getusers", DashboardController.getusers);
router.post("/getevents", DashboardController.getevents);
router.post("/deleteevent", DashboardController.deleteevent);

router.post("/getinvoices", DashboardController.getinvoices);
router.post("/getuserdetail", DashboardController.getuserdetail);
router.post("/getsponserpayments", DashboardController.getsponpays);
router.post("/gethostpayments", DashboardController.gethostpayments);
router.post("/pay-to-host", DashboardController.paytohost);
router.post("/create-paypal-order", DashboardController.createpaypalorder);
router.post("/capture-paypal-order", DashboardController.capturePaypalOrder);
router.post("/updaterole", DashboardController.updaterole);
 
module.exports = router;