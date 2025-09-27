const express = require("express");
const router = express.Router();
const notificationController = require("../controllers/users/notificationController");

router.post("/getallnotifcation", notificationController.getallnotifcation);
router.post("/updatenotifications", notificationController.updatenotifications);
router.post("/deleteNotifications", notificationController.deleteNotifications);
router.post(
  "/Deleteallnotifcation",
  notificationController.Deleteallnotifcation
);
module.exports = router; // Correct export
