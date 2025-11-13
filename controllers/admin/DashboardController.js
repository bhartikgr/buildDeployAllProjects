const db = require("../../db");

const nodemailer = require("nodemailer");
require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const axios = require("axios");

const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_SECRET = process.env.PAYPAL_SECRET;
const PAYPAL_API = "https://api-m.paypal.com"; // switch to live when ready

const transporter = nodemailer.createTransport({
  service: "gmail", // or your SMTP provider
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Helper: Generate PayPal access token
async function generateAccessToken() {
  const auth = Buffer.from(PAYPAL_CLIENT_ID + ":" + PAYPAL_SECRET).toString(
    "base64"
  );
  const response = await axios.post(
    PAYPAL_API + "/v1/oauth2/token",
    "grant_type=client_credentials",
    {
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    }
  );
  return response.data.access_token;
}

// Create PayPal order and save to host_payments
exports.createpaypalorder = async (req, res) => {
  try {
    const { amount, hostId, proposalId, paymentMethod } = req.body;

    const accessToken = await generateAccessToken();

    // Get host email

    const hostQuery = `SELECT paypalemailaddress FROM register WHERE id = ? LIMIT 1`;
    db.query(hostQuery, [hostId], async (err, hostResults) => {
      if (err)
        return res.status(500).json({
          success: false,
          message: "Database error fetching host",
          error: err,
        });

      const hostEmail = hostResults[0].paypalemailaddress;

      if (!hostEmail || hostEmail.trim() === "") {
        return res.status(400).json({
          success: false,
          message: "Host's PayPal email not found",
        });
      }

      // Create PayPal order
      const order = await axios.post(
        `${PAYPAL_API}/v2/checkout/orders`,
        {
          intent: "CAPTURE",
          purchase_units: [
            {
              reference_id: proposalId,
              amount: { currency_code: "USD", value: amount.toFixed(2) },
              payee: { email_address: hostEmail },
            },
          ],
          application_context: {
            brand_name: "YourApp",
            landing_page: "LOGIN",
            user_action: "PAY_NOW",
            return_url: `https://communitysponsor.org/admindashboard/?hostId=${hostId}&proposalId=${proposalId}&amount=${amount}`,
            cancel_url: `https://communitysponsor.org/admindashboard/?hostId=${hostId}&proposalId=${proposalId}&amount=${amount}`,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        }
      );

      const approvalUrl = order.data.links.find(
        (link) => link.rel === "approve"
      )?.href;
      if (!approvalUrl)
        return res
          .status(400)
          .json({ success: false, message: "No approval URL from PayPal" });

      // Only return order info; do not insert yet
      res.json({ success: true, approvalUrl, orderId: order.data.id });
    });
  } catch (error) {
    console.error(
      "PayPal create order error:",
      error.response?.data || error.message
    );
    res
      .status(500)
      .json({ success: false, message: "Failed to create PayPal order" });
  }
};

exports.capturePaypalOrder = async (req, res) => {
  try {
    const { orderId, hostId, proposalId, amount } = req.body;

    const accessToken = await generateAccessToken();

    const capture = await axios.post(
      `${PAYPAL_API}/v2/checkout/orders/${orderId}/capture`,
      {},
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (capture.data.status === "COMPLETED") {
      const insertQuery = `
        INSERT INTO host_payments
          (host_id, event_id, payment_type, amount, payment_method, transaction_id, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `;
      const insertValues = [
        hostId,
        proposalId,
        "transfer",
        amount,
        "paypal",
        orderId,
        "succeeded",
      ];

      db.query(insertQuery, insertValues, (err, result) => {
        if (err) {
          return res.status(500).json({
            success: false,
            message: "Database insert error",
            error: err,
          });
        }

        // Update sponsorship_payments after successful host_payment insert
        const updateQuery = `
          UPDATE sponsorship_payments
          SET paytohoststatus = 'yes'
          WHERE proposal_id = ?
        `;
        db.query(updateQuery, [proposalId], (updateErr, updateResult) => {
          if (updateErr) {
            return res.status(500).json({
              success: false,
              message: "Failed to update sponsorship status",
              error: updateErr,
            });
          }

          res.json({
            success: true,
            capture: capture.data,
            paymentRecordId: result.insertId,
            sponsorshipUpdate: updateResult.affectedRows,
          });
        });
      });
    } else {
      res.status(400).json({
        success: false,
        message: "Payment not completed",
        capture: capture.data,
      });
    }
  } catch (err) {
    console.error("PayPal capture error:", err.response?.data || err.message);
    res
      .status(500)
      .json({ success: false, message: "Failed to capture PayPal order" });
  }
};

//  paypal Integration End

exports.getusers = async (req, res) => {
  const query = `
    SELECT * 
    FROM register
    WHERE full_name <> 'admin'
    ORDER BY id DESC
    LIMIT 100
  `;

  db.query(query, (err, results) => {
    if (err) {
      return res.status(500).json({
        message: "Database query error",
        error: err,
      });
    }

    res.status(200).json({
      message: "Users fetched",
      results,
    });
  });
};

exports.getevents = async (req, res) => {
  const query = `
    SELECT * 
    FROM sponsorshipproposal_export
    ORDER BY id DESC`;

  db.query(query, (err, results) => {
    if (err) {
      return res.status(500).json({
        message: "Database query error",
        error: err,
      });
    }

    res.status(200).json({
      message: "Events fetched",
      results,
    });
  });
};

exports.deleteevent = async (req, res) => {
  const { id } = req.body; // Expecting event id from frontend

  if (!id) {
    return res.status(400).json({ message: "Event ID is required" });
  }

  const query = `DELETE FROM sponsorshipproposal_export WHERE id = ?`;

  db.query(query, [id], (err, result) => {
    if (err) {
      return res.status(500).json({
        message: "Database delete error",
        error: err,
      });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Event not found" });
    }

    res.status(200).json({
      message: "Event deleted successfully",
      deletedId: id,
    });
  });
};

exports.deleteuser = async (req, res) => {
  const { id } = req.body; // Expecting event id from frontend

  if (!id) {
    return res.status(400).json({ message: "Event ID is required" });
  }

  const query = `DELETE FROM register WHERE id = ?`;

  db.query(query, [id], (err, result) => {
    if (err) {
      return res.status(500).json({
        message: "Database delete error",
        error: err,
      });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({
      message: "User deleted successfully",
      deletedId: id,
    });
  });
};

exports.notifyuser = async (req, res) => {
  const { to, message } = req.body;

  // Validate input
  if (!to || !message) {
    return res
      .status(400)
      .send({ success: false, error: "Recipient and message are required" });
  }

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: to,
      subject: "Notification From Community Sponsor",
      text: message,
    });

    res.send({ success: true });
  } catch (err) {
    res.status(500).send({ success: false, error: err.message });
  }
};

exports.getuserdetail = async (req, res) => {
  const { userId } = req.body; // assuming userId comes in POST body

  if (!userId) {
    return res.status(400).json({
      message: "User ID is required",
    });
  }

  const query = `
    SELECT * 
    FROM register
    WHERE id = ?
    ORDER BY id DESC
  `;

  db.query(query, [userId], (err, results) => {
    if (err) {
      return res.status(500).json({
        message: "Database query error",
        error: err,
      });
    }

    if (results.length === 0) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    res.status(200).json({
      message: "User fetched successfully",
      result: results[0], // return a single user object
    });
  });
};

exports.getsponpays = async (req, res) => {
  const query = `
   SELECT sp.*, r.stripe_account_id, r.full_name, r.email
FROM sponsorship_payments sp
JOIN register r ON sp.sponsor_id = r.id
ORDER BY sp.id ASC
LIMIT 100;
  `;

  db.query(query, (err, results) => {
    if (err) {
      return res.status(500).json({
        message: "Database query error",
        error: err,
      });
    }

    res.status(200).json({
      message: "Sponser Fetched",
      results,
    });
  });
};

exports.gethostpayments = async (req, res) => {
  const query = `
   SELECT hp.*, r.stripe_account_id, r.full_name, r.email
FROM host_payments hp
JOIN register r ON hp.host_id = r.id
ORDER BY hp.id  DESC
LIMIT 100;
  `;

  db.query(query, (err, results) => {
    if (err) {
      return res.status(500).json({
        message: "Database query error",
        error: err,
      });
    }

    res.status(200).json({
      message: "Sponser Fetched",
      results,
    });
  });
};

exports.paytohost = async (req, res) => {
  const { amount, hostId, proposalId, paymentType, paymentMethod } = req.body;

  const query = `SELECT stripe_account_id, email FROM register WHERE id = ?;`;
  db.query(query, [hostId], async (err, results) => {
    if (err) {
      console.error("Database error:", err);
      return res
        .status(500)
        .json({ success: false, message: "Database query failed." });
    }

    if (results.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Host not found." });
    }

    const hostAccountId = results[0].stripe_account_id;
    const hostEmail = results[0].email;
    if (!hostAccountId) {
      return res
        .status(400)
        .json({ success: false, message: "Host account ID not available." });
    }

    try {
      const transfer = await stripe.transfers.create({
        amount: Math.round(amount * 100),
        currency: "usd",
        destination: hostAccountId,
      });

      const query = `
      INSERT INTO host_payments
        (host_id, event_id, payment_type, amount, payment_method, transaction_id, status)
      VALUES
        (?, ?, ?, ?, ?, ?, ?)
    `;

      await db.execute(query, [
        hostId,
        proposalId,
        paymentType,
        amount,
        paymentMethod,
        transfer.id,
        "succeeded",
      ]);

      const updateQuery = `
      UPDATE sponsorship_payments
      SET paytohoststatus = 'yes'
      WHERE proposal_id = ?
    `;
      await db.execute(updateQuery, [proposalId]);

      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: hostEmail,
        subject: "Payment Received",
        text: `Hello,
We are pleased to inform you that a payment of $${amount} has been successfully transferred to your account.
Transaction ID: ${transfer.id}

Thank you for partnering with us.
Best regards`,
      };

      transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
          console.error("Email sending error:", error);
          // Optionally you can still send the response even if email fails
        } else {
          console.log("Email sent: " + info.response);
        }
      });

      // Respond to API call
      res.json({ success: true, transfer });
    } catch (error) {
      console.error("Stripe transfer error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });
};

exports.getinvoices = async (req, res) => {
  const { user_id } = req.body; // get user_id from request body

  if (!user_id) {
    return res.status(400).json({
      message: "user_id is required",
    });
  }

  const query = `
 SELECT
    hp.*,
    sp.title,
    spay.id AS spay_id,
    spay.proposal_id,
    spay.sponsor_id,
    spay.host_id AS spay_host_id,
    spay.selectedtiers,
    r.id, r.full_name, r.email
FROM host_payments hp
LEFT JOIN sponsorshipproposal_export sp
    ON hp.event_id = sp.id
LEFT JOIN sponsorship_payments spay
    ON hp.event_id = spay.proposal_id
   AND hp.host_id = spay.host_id
LEFT JOIN register r
    ON hp.host_id = r.id  
WHERE hp.host_id = ?
ORDER BY hp.id ASC
LIMIT 100;
  `;

  db.query(query, [user_id], (err, results) => {
    if (err) {
      return res.status(500).json({
        message: "Database query error",
        error: err,
      });
    }

    res.status(200).json({
      message: "Invoices fetched",
      results,
    });
  });
};

exports.updaterole = async (req, res) => {
  try {
    const { user_id, current_role } = req.body;

    if (!user_id || !current_role) {
      return res
        .status(400)
        .json({ success: false, message: "Missing user_id or current_role" });
    }

    const query = "UPDATE register SET `current_role` = ? WHERE id = ?";
    db.query(query, [current_role, user_id], (err, result) => {
      if (err) {
        console.error("Error updating role:", err);
        return res
          .status(500)
          .json({ success: false, message: "Database error" });
      }

      if (result.affectedRows === 0) {
        return res
          .status(404)
          .json({ success: false, message: "User not found" });
      }

      return res.json({
        success: true,
        message: "Role updated successfully",
        user: { id: user_id, current_role },
      });
    });
  } catch (error) {
    console.error("Server error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};
exports.create_transfer_ToHost_Stripe = async (req, res) => {
  try {
    const payData = req.body.pay;
    console.log("Incoming pay data:", payData);

    // Step 1: Get host record from database
    const query = `SELECT * FROM register WHERE id = ?`;

    const host = await new Promise((resolve, reject) => {
      db.query(query, [payData.host_id], (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    });

    if (host.length === 0) {
      return res.status(404).json({ success: false, error: "Host not found" });
    }

    const connectedAccountId = host[0].stripe_account_id;
    if (!connectedAccountId) {
      return res
        .status(400)
        .json({ success: false, error: "Stripe account not connected" });
    }

    // Step 2: Create Stripe transfer
    const amt = payData.amount - payData.platfromfee;
    //const amt = 20;
    const amount = Math.round(amt * 100); // convert to cents
    const transfer = await stripe.transfers.create({
      amount: amount,
      currency: "usd",
      destination: connectedAccountId,
      description: "Payment to connected account",
    });

    console.log("✅ Transfer success:", transfer.id);

    // Step 3: Update sponsorship_payments table
    const updateQuery = `
      UPDATE sponsorship_payments 
      SET transferId_ToHost = ?, paymentMethod_ToHost = 'Stripe', paytohoststatus = ?
      WHERE id = ?
    `;

    await new Promise((resolve, reject) => {
      db.query(updateQuery, [transfer.id, "Yes", payData.id], (err, result) => {
        if (err) return reject(err);
        resolve(result);
      });
    });

    console.log("✅ sponsorship_payments updated for ID:", payData.id);

    // ✅ Step 4: Insert into host_payments table
    const insertQuery = `
      INSERT INTO host_payments 
      (host_id, event_id, payment_type, amount, payment_method, transaction_id, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    const paymentType = "transfer"; // or any label you want
    const status = "succeeded";

    await new Promise((resolve, reject) => {
      db.query(
        insertQuery,
        [
          payData.host_id,
          payData.proposal_id || null, // safe if event_id is optional
          paymentType,
          amt,
          "Stripe",
          transfer.id,
          status,
        ],
        (err, result) => {
          if (err) return reject(err);
          resolve(result);
        }
      );
    });

    // ✅ Step 5: Send email notification
    sendEmailPaymentToHost(host[0].email, host[0].full_name, amt, transfer.id);

    // Step 6: Send final response
    res.json({
      success: true,
      message: "Payment sent, records updated, and host notified successfully",
      transferId: transfer.id,
    });
  } catch (error) {
    console.error("❌ Error in create_transfer_ToHost_Stripe:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Internal server error",
    });
  }
};

function sendEmailPaymentToHost(hostEmail, hostName, amount, transferId) {
  const subject = `Payment Received from Communitysponsor.org`;

  const body = `
Dear ${hostName},

We’re pleased to inform you that your payout has been successfully processed.

**Transfer Details:**
- Amount: $${amount.toFixed(2)}
- Transfer ID: ${transferId}
- Payment Method: Stripe
- Status: Completed

You should receive the funds in your connected Stripe account shortly.

If you believe there’s any issue or delay, please contact our support team at support@communitysponsor.org.

Thank you for being part of Communitysponsor.org!

Best regards,  
Communitysponsor.org Team
`;

  const mailOptions = {
    from: `"Communitysponsor.org" <${process.env.EMAIL_USER}>`,
    to: hostEmail,
    subject,
    text: body,
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) console.error("❌ Error sending payout email:", error);
    else console.log("📧 Payout email sent:", info.response);
  });
}

exports.Stripetransfers = async (req, res) => {
  try {
    const transfers = await stripe.transfers.list({ limit: 50 });
    res.json(transfers.data);
  } catch (err) {
    console.error("Stripe API error:", err);
    res.status(500).json({ error: err.message });
  }
};
exports.Stripepayouts = async (req, res) => {
  try {
    const payouts = await stripe.payouts.list({ limit: 50 });
    res.json(payouts.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getUsersByRole = async (req, res) => {
  const { role } = req.params;

  let query =
    "SELECT id, email, full_name, role, current_role, roles FROM users WHERE 1=1";
  let queryParams = [];

  if (role === "hosts") {
    query +=
      " AND (role = 'host' OR roles LIKE '%event_host%' OR current_role = 'host')";
  } else if (role === "advertisers") {
    query +=
      " AND (role = 'advertiser' OR roles LIKE '%business_sponsor%' OR current_role = 'advertiser')";
  }

  db.query(query, queryParams, (err, results) => {
    if (err) {
      return res.status(500).json({
        message: "Database query error",
        error: err,
      });
    }

    res.status(200).json({
      message: "",
      results: results,
    });
  });
};

// Get user count by type
exports.getUserCounts = async (req, res) => {
  const query = `
    SELECT 
      COUNT(*) as total_users,
      COUNT(CASE WHEN role = 'host' OR roles LIKE '%event_host%' OR current_role = 'host' THEN 1 END) as hosts,
      COUNT(CASE WHEN role = 'advertiser' OR roles LIKE '%business_sponsor%' OR current_role = 'advertiser' THEN 1 END) as advertisers
    FROM  register
  `;

  db.query(query, (err, results) => {
    if (err) {
      return res.status(500).json({
        message: "Database query error",
        error: err,
      });
    }

    res.status(200).json({
      message: "",
      results: results[0],
    });
  });
};

exports.sendBroadcastEmail = async (req, res) => {
  const { subject, message, recipientType } = req.body;

  try {
    // Get recipients based on type
    let userQuery = "SELECT email, full_name FROM  register WHERE 1=1";
    let queryParams = [];

    if (recipientType === "hosts") {
      userQuery +=
        " AND (roles = 'host' OR roles LIKE '%event_host%' OR current_role = 'host')";
    } else if (recipientType === "advertisers") {
      userQuery +=
        " AND (roles = 'advertiser' OR roles LIKE '%business_sponsor%' OR current_role = 'advertiser')";
    }

    db.query(userQuery, queryParams, async (err, users) => {
      if (err) {
        console.error("Database query error:", err);
        return res.status(500).json({
          message: "Database query error",
          error: err,
        });
      }

      if (users.length === 0) {
        return res.status(404).json({
          message: "No recipients found for the selected type",
          recipientCount: 0,
        });
      }

      // Send emails to all recipients
      const emailPromises = users.map((user) => {
        const mailOptions = {
          from: `"Community Sponsor" <${process.env.EMAIL_USER}>`,
          to: user.email,
          subject: subject,
          html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #2563eb; margin: 0; font-size: 28px;">CommunitySponsor</h1>
          <p style="color: #6b7280; margin: 5px 0 0 0; font-size: 14px;">Connecting Communities & Sponsors</p>
        </div>
        
        <div style="background: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 30px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <h2 style="color: #1f2937; margin-top: 0; font-size: 24px;">${subject}</h2>
          <div style="color: #374151; line-height: 1.6; font-size: 16px; margin-top: 20px;">
            ${message.replace(/\n/g, "<br>")}
          </div>
        </div>
        
        <div style="margin-top: 30px; padding: 20px; background: #f8fafc; border-radius: 8px; text-align: center;">
          <p style="color: #666; margin: 0 0 10px 0;">
            Best regards,<br>
            <strong>The CommunitySponsor Team</strong>
          </p>
        </div>
        
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center;">
          <p style="color: #9ca3af; font-size: 12px; margin: 0;">
            This email was sent to ${user.full_name || user.email} as part of a broadcast message from CommunitySponsor.org.<br>
            &copy; ${new Date().getFullYear()} CommunitySponsor.org. All rights reserved.
          </p>
          <p style="color: #9ca3af; font-size: 12px; margin: 5px 0 0 0;">
            <a href="https://communitysponsor.org" style="color: #3b82f6; text-decoration: none;">Visit our website</a> | 
            
          </p>
        </div>
      </div>
    `,
        };

        return transporter.sendMail(mailOptions);
      });
      try {
        await Promise.all(emailPromises);

        // Save to broadcast_emails table
        const insertQuery = `
          INSERT INTO broadcast_emails (subject, message, recipient_type, recipient_count, sent_by) 
          VALUES (?, ?, ?, ?, ?)
        `;

        db.query(
          insertQuery,
          [
            subject,
            message,
            recipientType,
            users.length,
            "Admin", // or get from req.user if you have authentication
          ],
          (insertErr, result) => {
            if (insertErr) {
              console.error("Error saving broadcast email:", insertErr);
            }
          }
        );

        res.status(200).json({
          message: `Email successfully sent to ${users.length} recipients`,
          recipientCount: users.length,
        });
      } catch (emailError) {
        console.error("Error sending emails:", emailError);
        res.status(500).json({
          message: "Error sending some emails",
          error: emailError,
        });
      }
    });
  } catch (error) {
    console.error("Error in sendBroadcastEmail:", error);
    res.status(500).json({
      message: "Server error",
      error: error,
    });
  }
};

// Get sent emails history
exports.getBroadcastEmails = async (req, res) => {
  const query = `SELECT * FROM broadcast_emails ORDER BY sent_at DESC`;

  db.query(query, (err, results) => {
    if (err) {
      return res.status(500).json({
        message: "Database query error",
        error: err,
      });
    }

    res.status(200).json({
      message: "",
      results: results,
    });
  });
};

// Get email statistics
exports.getEmailStats = async (req, res) => {
  const query = `
    SELECT 
      recipient_type,
      COUNT(*) as total_emails,
      SUM(recipient_count) as total_recipients
    FROM broadcast_emails 
    GROUP BY recipient_type
  `;

  db.query(query, (err, results) => {
    if (err) {
      return res.status(500).json({
        message: "Database query error",
        error: err,
      });
    }

    res.status(200).json({
      message: "",
      results: results,
    });
  });
};
