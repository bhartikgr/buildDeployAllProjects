const db = require("../../db");
const nodemailer = require("nodemailer");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const multer = require("multer");
const path = require("path");
const Stripe = require("stripe");
require("dotenv").config();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const cron = require("node-cron");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});
exports.getSponsers = async (req, res) => {
  var status = req.body.status;

  const query = `SELECT * FROM sponsorshipproposal_export WHERE status =? order by id desc`;

  db.query(query, [status], (err, results) => {
    if (err) {
      return res.status(500).json({
        message: "Database query error",
        error: err,
      });
    }

    res.status(200).json({
      message: ``,
      results: results,
    });
  });
};
exports.getEvents = async (req, res) => {
  var status = req.body.status;

  const query = `SELECT * FROM events WHERE status =? order by id desc`;

  db.query(query, [status], (err, results) => {
    if (err) {
      return res.status(500).json({
        message: "Database query error",
        error: err,
      });
    }

    res.status(200).json({
      message: ``,
      results: results,
    });
  });
};
exports.localloadEvents = async (req, res) => {
  var id = req.body.id;

  const query = `SELECT * FROM events WHERE id =?`;

  db.query(query, [id], (err, row) => {
    if (err) {
      return res.status(500).json({
        message: "Database query error",
        error: err,
      });
    }

    res.status(200).json({
      message: ``,
      results: row[0],
    });
  });
};

exports.localloadProposal = async (req, res) => {
  var data = req.body;

  const query = `SELECT sponsorshipproposal_export.* from sponsorshipproposal_export WHERE sponsorshipproposal_export.id = ? ORDER BY sponsorshipproposal_export.id DESC;`;

  db.query(query, [data.id], (err, results) => {
    if (err) {
      return res.status(500).json({
        message: "Database query error",
        error: err,
      });
    }

    res.status(200).json({
      message: ``,
      results: results,
    });
  });
};

exports.register = async (req, res) => {
  const {
    roles,
    current_role,
    full_name,
    email,
    subscription_plan,
    paypalemailaddress,
    subscription_status,
    payout_method,
    company_name,
    phone,
    website,
    location,
    industry,
    bio,
  } = req.body;

  const checkQuery = `SELECT id FROM register WHERE email = ?`;

  db.query(checkQuery, [email], async (err, results) => {
    if (err) {
      return res.status(500).json({ message: "Database error", error: err });
    }

    if (results.length > 0) {
      return res
        .status(200)
        .json({ message: "Email already registered", status: 2 });
    }

    const date = new Date();

    // Step 1: Generate random password
    const plainPassword = crypto
      .randomBytes(6)
      .toString("base64")
      .replace(/[^a-zA-Z0-9]/g, "")
      .slice(0, 10);

    // Step 2: Hash the password
    const hashedPassword = await bcrypt.hash(plainPassword, 10);

    // Step 3: Insert into database
    const insertQuery = `
      INSERT INTO register (
        \`roles\`,
        \`current_role\`,
        \`full_name\`,
        \`email\`,
        \`subscription_plan\`,
        \`subscription_status\`,
        \`payout_method\`,
        \`company_name\`,
        \`phone\`,
        \`website\`,
        \`location\`,
        \`industry\`,
        \`bio\`,
        \`password\`,
        \`viewpassword\`,
        \`created_at\`
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
      JSON.stringify(roles),
      current_role,
      full_name,
      email,
      subscription_plan,
      subscription_status,
      payout_method,
      company_name,
      phone,
      website,
      location,
      industry,
      bio,
      hashedPassword,
      plainPassword,
      date,
    ];

    db.query(insertQuery, values, (insertErr, result) => {
      if (insertErr) {
        return res
          .status(500)
          .json({ message: "Insert failed", error: insertErr });
      }

      const insertedId = result.insertId;

      const fetchQuery = `SELECT * FROM register WHERE id = ?`;
      db.query(fetchQuery, [insertedId], (fetchErr, rows) => {
        if (fetchErr) {
          return res
            .status(500)
            .json({ message: "Fetch after insert failed", error: fetchErr });
        }

        const registeredUser = rows[0];
        sendEmailLoginpassword(email, full_name || "User", plainPassword);
        return res.status(201).json({
          message: "Registered successfully",
          status: 1,
          user: registeredUser,
          viewPassword: plainPassword, // ⬅️ include plain password only here
        });
      });
    });
  });
};

exports.changePassword = async (req, res) => {
  const { id, newPassword } = req.body;

  if (!id || !newPassword) {
    return res.status(400).json({ message: "All fields are required" });
  }

  try {
    const getUserQuery = `SELECT id, email, full_name FROM register WHERE id = ?`;
    db.query(getUserQuery, [id], async (err, results) => {
      if (err) {
        return res.status(500).json({ message: "Database error", error: err });
      }

      if (results.length === 0) {
        return res.status(404).json({ message: "User not found" });
      }

      const user = results[0];
      const hashedNewPassword = await bcrypt.hash(newPassword, 10);

      const updateQuery = `
        UPDATE register 
        SET password = ?, viewpassword = ? 
        WHERE id = ?
      `;

      db.query(
        updateQuery,
        [hashedNewPassword, newPassword, id],
        (updateErr) => {
          if (updateErr) {
            return res
              .status(500)
              .json({ message: "Password update failed", error: updateErr });
          }

          // ✅ Send email after successful password update
          AdminchangePassword(user.email, user.full_name, newPassword);

          return res
            .status(200)
            .json({ message: "Password changed successfully", status: 1 });
        }
      );
    });
  } catch (error) {
    console.error("Error changing password:", error);
    return res.status(500).json({ message: "Server error", error });
  }
};

//Password
function sendEmailLoginpassword(to, fullName, newPassword) {
  const subject = `Welcome to Communitysponsor.org - Your Login Details`;

  const body = `
Dear ${fullName},

Thank you for registering with **Communitysponsor.org**.

Your account has been successfully created. Below are your login credentials:

**Email:** ${to}  
**Password:** ${newPassword}

Please log in and change this password immediately to keep your account secure.

If you have any questions or need assistance, feel free to contact our support team.

We're excited to have you on board!

Regards,  
Communitysponsor.org Team
  `;

  const mailOptions = {
    from: "Communitysponsor.org",
    to,
    subject,
    text: body,
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) console.error("Error sending email:", error);
    else console.log("Registration email sent:", info.response);
  });
}

function AdminchangePassword(to, fullName, newPassword) {
  const subject = `Notification Form Community Sponsor`;

  const body = `
Dear ${fullName},

Our Team change your password
Below are your login credentials:

**Email:** ${to}  
**Password:** ${newPassword}

Please log in and change this password immediately to keep your account secure.

If you have any questions or need assistance, feel free to contact our support team.

We're excited to have you on board!

Regards,  
Communitysponsor.org Team
  `;

  const mailOptions = {
    from: "Communitysponsor.org",
    to,
    subject,
    text: body,
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) console.error("Error sending email:", error);
    else console.log("Registration email sent:", info.response);
  });
}

function resetpassword(to, newPassword) {
  const subject = `Reset Password Mail From Communitysponsor.org - Your Login Details`;

  const body = `
Dear User,

Your Password has been successfully changed. Below are your login credentials:

**Email:** ${to}  
**Password:** ${newPassword}

Please log in and change this password immediately to keep your account secure.

If you have any questions or need assistance, feel free to contact our support team.

We're excited to have you on board!

Regards,  
Communitysponsor.org Team
  `;

  const mailOptions = {
    from: "Communitysponsor.org",
    to,
    subject,
    text: body,
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) console.error("Error sending email:", error);
    else console.log("Reset Password Mail:", info.response);
  });
}

exports.proposalData = async (req, res) => {
  const data = req.body;
  const {
    event_type,
    title,
    eventId,
    description,
    mainamount,
    sponsorship_type,
    sponsorship_tiers,
    event_reach,
    event_platform_type,
    event_platform_link,
    audience_demographics,
    benefits,
    purchased_addons,
    email_blast_sent,
    analytics_enabled,
    is_featured,
    status,
    images,
    video_links,
    location,
    spnotes,
    numfamily,
    highlight,
    deadline,
    ticketsOnSale,
    ticketPrice,
    created_by,
    created_by_id,
  } = data;

  const created_at = new Date();

  const insertQuery = `
    INSERT INTO sponsorshipproposal_export (
    event_type,
      title,
      event_id,
      description,
      amount_requested,
      sponsorship_type,
      sponsorship_tiers,
      event_reach,
      event_platform_type,
      event_platform_link,
      audience_demographics,
      benefits,
      purchased_addons,
      email_blast_sent,
      analytics_enabled,
      is_featured,
      status,
      images,
      video_links,
      location,
      spnotes,
      numfamily,
      highlight,
      deadline,
      ticketsOnSale,
      ticketPrice,
      created_date,
      created_by,
      created_by_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const values = [
    event_type,
    title,
    eventId,
    description,
    mainamount,
    sponsorship_type,
    JSON.stringify(sponsorship_tiers),
    event_reach,
    event_platform_type,
    event_platform_link,
    audience_demographics,
    JSON.stringify(benefits),
    JSON.stringify(purchased_addons),
    email_blast_sent,
    analytics_enabled,
    is_featured,
    status,
    JSON.stringify(images),
    JSON.stringify(video_links),
    location,
    spnotes,
    numfamily,
    highlight,
    deadline,
    ticketsOnSale,
    ticketPrice,
    created_at,
    created_by,
    created_by_id,
  ];

  db.query(insertQuery, values, (err, result) => {
    if (err) {
      console.error("Insert Error:", err);
      return res.status(500).json({ message: "Insert failed", error: err });
    }

    const proposalId = result.insertId;

    // NOTIFICATION SYSTEM ADDED HERE
    // Get all sponsors for notifications
    const getSponsorsQuery = `
      SELECT id FROM register
      WHERE JSON_CONTAINS(roles, '["business_sponsor"]')
    `;

    db.query(getSponsorsQuery, (err, sponsorsResult) => {
      if (err) {
        console.error("Error fetching sponsors:", err);
      } else {
        // Create notifications for all sponsors
        const sponsors = sponsorsResult;

        sponsors.forEach((sponsor) => {
          const notificationQuery = `
            INSERT INTO allnotifications SET ?
          `;

          const notificationData = {
            user_id: sponsor.id,
            title: "New Sponsorship Opportunity! 🎯",
            message: `A new proposal "${title}" has been created by ${created_by}. Check it out now!`,
            type: "new_proposal",
            related_id: proposalId,
            related_type: "proposal",
            created_at: new Date(),
          };

          db.query(notificationQuery, notificationData, (notifErr) => {
            if (notifErr) {
              console.error("Error creating notification:", notifErr);
            }
          });
        });

        // Emit real-time notification via socket.io
        if (global.io) {
          global.io.emit("new_proposal_notification", {
            proposalId: proposalId,
            title: title,
            createdBy: created_by,
            message: `New proposal "${title}" created by ${created_by}`,
          });
        }
      }
    });

    // EXISTING EMAIL CODE - UNCHANGED
    const getEmailsQuery = `
      SELECT GROUP_CONCAT(email SEPARATOR ', ') AS sponsorEmails
      FROM \`register\`
      WHERE \`current_role\` LIKE '%business_sponsor%'
    `;

    db.query(getEmailsQuery, (err, emailResult) => {
      if (err) {
        console.error("Error fetching sponsor emails:", err);
        return res
          .status(500)
          .json({ message: "Error fetching sponsor emails" });
      }
      const sponsorEmails = emailResult[0]?.sponsorEmails || null;
      console.log(created_by);
      sendEmailTosponsors(sponsorEmails, title, created_by);
    });

    return res.status(201).json({
      message: "Proposal inserted successfully",
      insertId: result.insertId,
    });
  });
};

//Email For All Sponsores
function sendEmailTosponsors(to, proposalTitle, hostEmail) {
  const subject = `🎉 A New Event Proposal Published!`;

  const body = `
<html>
  <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
    <h2 style="color: #2b6cb0;">🎉 A New Event Proposal Published!</h2>
    <p>
      A new proposal titled <strong>"${proposalTitle}"</strong> has been published.
    </p>
    <p>
      Please check and contact the host if you are interested:
      <a href="mailto:${hostEmail}" style="color: #1a73e8;">${hostEmail}</a>
    </p>
    <p>
      <strong>Published by:</strong> ${hostEmail}
    </p>
    <br>
    <p>Best regards,<br>
    <strong>CommunitySponsor.org Team</strong></p>
  </body>
</html>
`;

  const mailOptions = {
    from: "Communitysponsor.org <avinayquicktech@gmail.com>",
    to,
    subject,
    html: body,
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error("Error sending email:", error);
    } else {
      console.log("Sponsors notification sent to all", info.response);
    }
  });
}

//Email For All Sponsores
function sendEmailToEditsponsors(to, proposalTitle, hostEmail, proposalId) {
  const subject = `🎉 An Event Proposal Has Been Edited!`;

  const htmlBody = `
  <html>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
      <h2 style="color: #2b6cb0;">🎉 Event Proposal Updated</h2>
      <p>
        A proposal titled <strong>"${proposalTitle}"</strong> has been edited by 
        <strong>${hostEmail}</strong>.
      </p>
      <p>
        Please check the updated details here: 
        <a href="https://communitysponsor.org/proposaldetails?id=${proposalId}" target="_blank" style="color: #1a73e8; text-decoration: none;">
          View Proposal
        </a>
      </p>
      <br>
      <p>
        Best regards,<br>
        <strong>CommunitySponsor.org Team</strong>
      </p>
    </body>
  </html>
  `;

  const mailOptions = {
    from: "Communitysponsor.org <avinayquicktech@gmail.com>",
    to,
    subject,
    html: htmlBody, // ✅ use HTML instead of plain text
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error("Error sending email:", error);
    } else {
      console.log("Sponsors notification sent to all:", info.response);
    }
  });
}

function sendEmailToEditsponsorsbyadmin(to, proposalTitle, proposalId) {
  const subject = `🎉 An Event Proposal Has Been Edited!`;

  const htmlBody = `
  <html>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
      <h2 style="color: #2b6cb0;">🎉 Event Proposal Updated</h2>
      <p>
        A proposal titled <strong>"${proposalTitle}"</strong> has been edited by 
        <strong>Admin</strong>.
      </p>
      <p>
        Please check the updated details here: 
        <a href="https://communitysponsor.org/proposaldetails?id=${proposalId}" target="_blank" style="color: #1a73e8; text-decoration: none;">
          View Proposal
        </a>
      </p>
      <br>
      <p>
        Best regards,<br>
        <strong>CommunitySponsor.org Team</strong>
      </p>
    </body>
  </html>
  `;

  const mailOptions = {
    from: "Communitysponsor.org <avinayquicktech@gmail.com>",
    to,
    subject,
    html: htmlBody, // ✅ use HTML instead of plain text
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error("Error sending email:", error);
    } else {
      console.log("Sponsors notification sent to all:", info.response);
    }
  });
}

exports.geteventforadmin = async (req, res) => {
  const { id } = req.params;

  try {
    const [rows] = await db
      .promise()
      .query(
        "SELECT created_by_id FROM sponsorshipproposal_export WHERE id = ?",
        [id]
      );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Not found" });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error("DB error:", err);
    res.status(500).json({ error: "Server error" });
  }
};

exports.hostpurchase = async (req, res) => {
  const {
    user_id,
    proposal_id,
    purchase_type,
    item_description,
    item_details,
    amount,
    transaction_id,
    payment_method,
    status,
  } = req.body;

  const created_at = new Date();

  const insertQuery = `
    INSERT INTO hostpurchase (
      user_id,
      proposal_id,
      purchase_type,
      item_description,
      item_details,
      amount,
      transaction_id,
      payment_method,
      status,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const values = [
    user_id,
    proposal_id,
    purchase_type,
    item_description,
    JSON.stringify(item_details),
    amount,
    transaction_id,
    payment_method,
    status,
    created_at,
  ];

  db.query(insertQuery, values, (err, result) => {
    if (err) {
      console.error("Insert Error:", err);
      return res.status(500).json({ message: "Insert failed", error: err });
    }

    return res.status(201).json({
      message: "Host purchase recorded successfully",
      insertId: result.insertId,
    });
  });
};

exports.getSponsorshipProposal = async (req, res) => {
  var data = req.body;

  const query = `SELECT sponsorshipproposal_export.* FROM sponsorshipproposal_export  WHERE sponsorshipproposal_export.created_by = ? ORDER BY sponsorshipproposal_export.id DESC;`;

  db.query(query, [data.created_by], (err, results) => {
    if (err) {
      return res.status(500).json({
        message: "Database query error",
        error: err,
      });
    }

    res.status(200).json({
      message: ``,
      results: results,
    });
  });
};
exports.getSponsorshipProposalHostpage = async (req, res) => {
  var data = req.body;
  console.log(data);
  const query = `SELECT sponsorshipproposal_export.* FROM sponsorshipproposal_export  WHERE sponsorshipproposal_export.created_by_id = ? ORDER BY sponsorshipproposal_export.id DESC;`;

  db.query(query, [data.created_by], (err, results) => {
    if (err) {
      return res.status(500).json({
        message: "Database query error",
        error: err,
      });
    }

    res.status(200).json({
      message: ``,
      results: results,
    });
  });
};

exports.archiveSponsorshipProposal = async (req, res) => {
  const data = req.body;
  console.log("Archiving proposal:", data);

  if (!data.proposal_id) {
    return res.status(400).json({
      success: false,
      message: "Missing proposal_id",
    });
  }

  const query = `
    UPDATE sponsorshipproposal_export 
    SET status = ? 
    WHERE id = ?
  `;

  db.query(
    query,
    [data.status || "archived", data.proposal_id, data.created_by],
    (err, results) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({
          success: false,
          message: "Database query error",
          error: err,
        });
      }

      if (results.affectedRows === 0) {
        return res.status(404).json({
          success: false,
          message: "Proposal not found or not owned by this user",
        });
      }

      res.status(200).json({
        success: true,
        message: "Proposal archived successfully",
      });
    }
  );
};

exports.deleteSponsorshipProposal = async (req, res) => {
  const data = req.body;
  console.log("Deleting proposal:", data);

  if (!data.proposal_id) {
    return res.status(400).json({
      success: false,
      message: "Missing proposal_id",
    });
  }

  const query = `
    DELETE FROM sponsorshipproposal_export 
    WHERE id = ?
  `;

  db.query(query, [data.proposal_id], (err, results) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({
        success: false,
        message: "Database query error",
        error: err,
      });
    }

    if (results.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Proposal not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Proposal deleted permanently",
    });
  });
};

exports.registerwithgoogle = async (req, res) => {
  const {
    roles,
    current_role,
    full_name,
    email,
    subscription_plan,
    subscription_status,
    payout_method,
    company_name,
    phone,
    website,
    location,
    industry,
    bio,
  } = req.body;

  const checkQuery = `SELECT * FROM register WHERE email = ?`;

  db.query(checkQuery, [email], async (err, results) => {
    if (err) {
      return res.status(500).json({ message: "Database error", error: err });
    }

    if (results.length > 0) {
      if (current_role === results[0].current_role) {
        return res.status(200).json({
          message: "Registered successfully",
          status: 1,
          user: results[0],
          viewPassword: "", // ⬅️ include plain password only here
        });
      } else {
        return res.status(200).json({
          message: "This email already registered for other account type",
          status: 2,
          user: results[0],
          viewPassword: "", // ⬅️ include plain password only here
        });
      }
    } else {
      const date = new Date();

      // Step 1: Generate random password
      const plainPassword = crypto
        .randomBytes(6)
        .toString("base64")
        .replace(/[^a-zA-Z0-9]/g, "")
        .slice(0, 10);

      // Step 2: Hash the password
      const hashedPassword = await bcrypt.hash(plainPassword, 10);

      // Step 3: Insert into database
      const insertQuery = `
      INSERT INTO register (
        \`roles\`,
        \`current_role\`,
        \`full_name\`,
        \`email\`,
        \`subscription_plan\`,
        \`subscription_status\`,
        \`payout_method\`,
        \`company_name\`,
        \`phone\`,
        \`website\`,
        \`location\`,
        \`industry\`,
        \`bio\`,
        \`password\`,
        \`viewpassword\`,
        \`created_at\`
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

      const values = [
        JSON.stringify(roles),
        current_role,
        full_name,
        email,
        subscription_plan,
        subscription_status,
        payout_method,
        company_name,
        phone,
        website,
        location,
        industry,
        bio,
        hashedPassword,
        plainPassword,
        date,
      ];

      db.query(insertQuery, values, (insertErr, result) => {
        if (insertErr) {
          return res
            .status(500)
            .json({ message: "Insert failed", error: insertErr });
        }

        const insertedId = result.insertId;

        const fetchQuery = `SELECT * FROM register WHERE id = ?`;
        db.query(fetchQuery, [insertedId], (fetchErr, rows) => {
          if (fetchErr) {
            return res
              .status(500)
              .json({ message: "Fetch after insert failed", error: fetchErr });
          }

          const registeredUser = rows[0];
          sendEmailLoginpassword(email, full_name || "User", password);
          return res.status(201).json({
            message: "Registered successfully",
            status: 1,
            user: registeredUser,
            viewPassword: plainPassword, // ⬅️ include plain password only here
          });
        });
      });
    }
  });
};
exports.loginwithgoogle = async (req, res) => {
  const {
    roles,
    current_role,
    full_name,
    email,
    subscription_plan,
    subscription_status,
    payout_method,
    company_name,
    phone,
    website,
    location,
    industry,
    bio,
  } = req.body;

  const checkQuery = `SELECT * FROM register WHERE email = ?`;

  db.query(checkQuery, [email], async (err, results) => {
    if (err) {
      return res.status(500).json({ message: "Database error", error: err });
    }

    if (results.length > 0) {
      return res.status(200).json({
        message: "Login successfully",
        status: 1,
        user: results[0],
        viewPassword: "", // ⬅️ include plain password only here
      });
    } else {
      const date = new Date();

      // Step 1: Generate random password
      const plainPassword = crypto
        .randomBytes(6)
        .toString("base64")
        .replace(/[^a-zA-Z0-9]/g, "")
        .slice(0, 10);

      // Step 2: Hash the password
      const hashedPassword = await bcrypt.hash(plainPassword, 10);

      // Step 3: Insert into database
      const insertQuery = `
      INSERT INTO register (
        \`roles\`,
        \`current_role\`,
        \`full_name\`,
        \`email\`,
        \`subscription_plan\`,
        \`subscription_status\`,
        \`payout_method\`,
        \`company_name\`,
        \`phone\`,
        \`website\`,
        \`location\`,
        \`industry\`,
        \`bio\`,
        \`password\`,
        \`viewpassword\`,
        \`created_at\`
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

      const values = [
        JSON.stringify(roles),
        current_role,
        full_name,
        email,
        subscription_plan,
        subscription_status,
        payout_method,
        company_name,
        phone,
        website,
        location,
        industry,
        bio,
        hashedPassword,
        plainPassword,
        date,
      ];

      db.query(insertQuery, values, (insertErr, result) => {
        if (insertErr) {
          return res
            .status(500)
            .json({ message: "Insert failed", error: insertErr });
        }

        const insertedId = result.insertId;

        const fetchQuery = `SELECT * FROM register WHERE id = ?`;
        db.query(fetchQuery, [insertedId], (fetchErr, rows) => {
          if (fetchErr) {
            return res
              .status(500)
              .json({ message: "Fetch after insert failed", error: fetchErr });
          }

          const registeredUser = rows[0];

          return res.status(201).json({
            message: "Registered successfully",
            status: 1,
            user: registeredUser,
            viewPassword: plainPassword, // ⬅️ include plain password only here
          });
        });
      });
    }
  });
};

exports.login = async (req, res) => {
  const { email, password } = req.body;
  try {
    // Check if user already exists
    db.query(
      "SELECT * FROM register WHERE email = ?",
      [email],
      async (err, rows) => {
        if (err) {
          return res
            .status(500)
            .json({ message: "Database query error", error: err });
        }

        if (rows.length > 0) {
          const user = rows[0];
          console.log(user.password);
          // Check if password matches
          if (user.password === null) {
            res
              .status(200)
              .json({ status: "2", message: "Invalid email or password" });
          } else {
            const isPasswordValid = await bcrypt.compare(
              password,
              user.password
            );
            if (!isPasswordValid) {
              return res
                .status(200)
                .json({ status: "2", message: "Invalid email or password" });
            } else {
              res.status(200).json({
                message: "Login successfully",
                status: "1",
                user: rows[0],
              });
            }
          }
        } else {
          res
            .status(200)
            .json({ status: "2", message: "Invalid email or password" });
        }
      }
    );
  } catch (err) {
    res.status(500).json({
      message: "Server error",
      error: err.message,
    });
  }
};

// Get Host Notifications
exports.getnotifications = async (req, res) => {
  const { user_id } = req.body;

  if (!user_id) {
    return res.status(400).json({
      message: "user_id is required",
    });
  }

  const query = `SELECT * FROM notifications WHERE user_id = ? AND user_type = 'event_host';`;

  db.query(query, [user_id], (err, results) => {
    if (err) {
      return res.status(500).json({
        message: "Database query error",
        error: err,
      });
    }

    res.status(200).json({
      message: "Notification fetched",
      results,
    });
  });
};

exports.checkUser = async (req, res) => {
  const { email, userType } = req.body;

  if (!email || !userType) {
    return res
      .status(400)
      .json({ message: "Email and user type are required", exists: false });
  }

  try {
    // 🟢 Check if user exists in the database

    db.query(
      "SELECT * FROM register WHERE email = ? AND `current_role` = ?",
      [email, userType],
      async (err, rows) => {
        if (err) {
          console.error("Database query error:", err);
          return res
            .status(500)
            .json({ message: "Database query error", exists: false });
        }
        console.log(rows);
        if (rows.length > 0) {
          const plainPassword = crypto
            .randomBytes(6)
            .toString("base64")
            .replace(/[^a-zA-Z0-9]/g, "")
            .slice(0, 10);

          bcrypt.hash(plainPassword, 10, (err, hashedPassword) => {
            if (err) {
              console.error("Hash error:", err);
              return res.status(500).json({ message: "Server error" });
            }

            db.query(
              "UPDATE register SET viewpassword = ?, password = ? WHERE email = ? AND `current_role` = ?",
              [plainPassword, hashedPassword, email, userType],
              (error, result) => {
                if (error) {
                  console.error("DB update error:", error);
                  return res.status(500).json({ message: "Server error" });
                }

                return res.status(200).json({
                  message:
                    "Password reset successful. Please check your email.",
                  exists: true,
                  user: rows[0],
                });
              }
            );

            resetpassword(email, plainPassword);
          });
        } else {
          return res
            .status(404)
            .json({ message: "User not found", exists: false });
        }
      }
    );
  } catch (err) {
    console.error("Server error:", err);
    res.status(500).json({
      message: "Server error",
      exists: false,
    });
  }
};

exports.emailBlast = async (req, res) => {
  const {
    proposal_id,
    host_id,
    subject,
    custom_message,
    recipients_count,
    cost,
    payment_method,
    status,
    url,
    userdetail,
    proposaldetail,
  } = req.body;

  try {
    // Query for all users with role "business_sponsor"
    db.query(
      "SELECT * FROM register WHERE `current_role` = ?",
      ["business_sponsor"],
      async (err, results) => {
        if (err) {
          return res
            .status(500)
            .json({ message: "Database query error", error: err });
        }
        console.log(proposaldetail);
        if (results.length > 0) {
          for (const user of results) {
            const to = user.email; // Adjust if your email field is named differently

            // Call your email function
            sendEmailBlast(
              to,
              proposaldetail,
              custom_message,
              userdetail,
              subject,
              url
            );
          }
          const insertQuery = `
  INSERT INTO proposal_email_blasts 
  (proposal_id, host_id, subject, custom_message, recipients_count, status, cost, payment_method) 
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`;

          const values = [
            proposal_id,
            host_id,
            subject,
            custom_message || null,
            results.length,
            status || "pending",
            cost || null,
            payment_method || null,
          ];

          db.query(insertQuery, values, (insertErr, insertResult) => {
            if (insertErr) {
              console.error("Insert failed:", insertErr);
            } else {
            }
          });
          res.status(200).json({ message: "Emails sent successfully" });
        } else {
          res
            .status(404)
            .json({ message: "No business sponsors found", error: err });
        }
      }
    );
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};
const generateEmailBody = (proposal, customMessage, host, url) => {
  return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #10b981, #059669); color: white; padding: 24px; text-align: center;">
          <h1 style="margin: 0; font-size: 24px;">New Sponsorship Opportunity</h1>
        </div>
        
        <div style="padding: 24px; background: white;">
          <h2 style="color: #1f2937; margin-bottom: 16px;">${proposal.title}</h2>
          
          ${
            customMessage
              ? `
            <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin-bottom: 24px;">
              <p style="margin: 0; font-style: italic; color: #4b5563;">
                "${customMessage}"
              </p>
              <p style="margin: 8px 0 0 0; font-size: 14px; color: #6b7280;">
                - ${host.full_name}, ${host.company_name}
              </p>
            </div>
          `
              : ""
          }
          
          <div style="margin-bottom: 24px;">
            <h3 style="color: #374151; margin-bottom: 12px;">Event Details</h3>
            <p style="margin: 4px 0; color: #4b5563;"><strong>Event:</strong> ${proposal.title}</p>
            <p style="margin: 4px 0; color: #4b5563;"><strong>Description:</strong> ${proposal.description}</p>
            ${proposal.event_reach ? `<p style="margin: 4px 0; color: #4b5563;"><strong>Expected Reach:</strong> ${proposal.event_reach}</p>` : ""}
            ${proposal.audience_demographics ? `<p style="margin: 4px 0; color: #4b5563;"><strong>Audience:</strong> ${proposal.audience_demographics}</p>` : ""}
          </div>

          ${
            proposal.sponsorship_tiers &&
            JSON.parse(proposal.sponsorship_tiers).length > 0
              ? `
    <div style="margin-bottom: 24px;">
      <h3 style="color: #374151; margin-bottom: 12px;">Sponsorship Opportunities</h3>
      ${JSON.parse(proposal.sponsorship_tiers)
        .map(
          (tier) => `
          <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin-bottom: 12px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <h4 style="margin: 0; color: #1f2937;">${tier.name}</h4>
              <span style="font-size: 20px; font-weight: bold; color: #10b981;">$${Number(tier.amount).toLocaleString()}</span>
            </div>
            <p style="margin: 8px 0; color: #6b7280; font-size: 14px;">${tier.description}</p>
            <div style="margin-top: 8px;">
              ${tier.benefits
                .map(
                  (benefit) => `
                <span style="display: inline-block; background: #ecfdf5; color: #065f46; padding: 4px 8px; border-radius: 4px; font-size: 12px; margin: 2px 4px 2px 0;">
                  ✓ ${benefit}
                </span>
              `
                )
                .join("")}
            </div>
          </div>
        `
        )
        .join("")}
    </div>
  `
              : ""
          }


          <div style="text-align: center; margin: 32px 0;">
            <a href="${url}/proposal-details?id=${proposal.id}" 
               style="background: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600;">
              View Full Proposal
            </a>
          </div>
        </div>

        <div style="background: #f9fafb; padding: 16px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280;">
          <p style="margin: 0 0 8px 0;"><strong>Contact Information:</strong></p>
          <p style="margin: 2px 0;">${host.full_name} - ${host.company_name}</p>
          <p style="margin: 2px 0;">Email: ${host.email}</p>
          ${host.phone ? `<p style="margin: 2px 0;">Phone: ${host.phone}</p>` : ""}
          
          <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #e5e7eb;">
            <p style="margin: 0;">You're receiving this because you opted into sponsor updates on CommunitySponsor.org</p>
            <p style="margin: 4px 0 0 0;">
              <a href="#" style="color: #6b7280;">Unsubscribe from future sponsor emails</a>
            </p>
          </div>
        </div>
      </div>
    `;
};
function sendEmailBlast(to, proposal, customMessage, host, subject, url) {
  const mailOptions = {
    from: "Communitysponsor.org",
    to,
    subject: subject,
    html: generateEmailBody(proposal, customMessage, host, url),
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) console.error("Error sending email:", error);
    else console.log(`✅ Reminder email sent to ${to}`);
  });
}

exports.getsponsoruser = async (req, res) => {
  var current_role = req.body.current_role;

  const query = "SELECT * FROM register WHERE `current_role` =?";

  db.query(query, [current_role], (err, results) => {
    if (err) {
      return res.status(500).json({
        message: "Database query error",
        error: err,
      });
    }

    res.status(200).json({
      message: ``,
      results: results,
    });
  });
};
exports.getallproposal = async (req, res) => {
  const query = "SELECT * FROM sponsorshipproposal_export order by id desc";

  db.query(query, (err, results) => {
    if (err) {
      return res.status(500).json({
        message: "Database query error",
        error: err,
      });
    }

    res.status(200).json({
      message: ``,
      results: results,
    });
  });
};
exports.getproposalbrowser = async (req, res) => {
  const query =
    "SELECT * FROM sponsorshipproposal_export where status =? And is_funded =? order by created_date desc";

  db.query(query, ["active", 0], (err, results) => {
    if (err) {
      return res.status(500).json({
        message: "Database query error",
        error: err,
      });
    }

    res.status(200).json({
      message: ``,
      results: results,
    });
  });
};
// Setup multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/proposals/"); // Folder to store uploaded files
  },
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, uniqueName + ext);
  },
});

const upload = multer({ storage }).single("image"); // field name must match frontend
exports.uploadimageVideo = (req, res) => {
  upload(req, res, (err) => {
    if (err) {
      return res
        .status(500)
        .json({ error: "Upload failed", details: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const fileUrl = `https://communitysponsor.org/backend/uploads/proposals/${req.file.filename}`;
    res.status(200).json({ file_url: fileUrl });
  });
};

//Get Browser Event
exports.getbrowserevents = async (req, res) => {
  const { eventIds } = req.body;

  if (!Array.isArray(eventIds) || eventIds.length === 0) {
    return res
      .status(200)
      .json({ message: "Invalid or empty eventIds", results: [] });
  }

  console.log("Received event IDs:", eventIds);

  const placeholders = eventIds.map(() => "?").join(", ");
  const query = `
    SELECT * FROM events
    WHERE status = ? AND id IN (${placeholders})
    ORDER BY id DESC
  `;

  db.query(query, ["published", ...eventIds], (err, results) => {
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

exports.getsponsorSubscriptiondetail = async (req, res) => {
  const { user_id } = req.body;
  const query = `SELECT * FROM register WHERE id = ?`;

  db.query(query, [user_id], (err, row) => {
    if (err) {
      return res.status(500).json({
        message: "Database query error",
        error: err,
      });
    }

    res.status(200).json({
      message: "Events fetched",
      results: row,
    });
  });
};
exports.paymentCharge = async (req, res) => {
  const { amount, paymentMethodId } = req.body;

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount, // in cents
      currency: "usd",
      payment_method: paymentMethodId,
      confirm: false, // frontend will confirm
    });

    res
      .status(200)
      .json({ status: "1", clientSecret: paymentIntent.client_secret });
  } catch (error) {
    res.status(500).json({ status: "2", message: error.message });
  }
};

exports.paymentSave = (req, res) => {
  const { payment_type, confirmResult, plan, user_id } = req.body;

  if (!confirmResult?.id || !plan || !user_id) {
    return res
      .status(400)
      .json({ status: "0", message: "Missing required data" });
  }

  // Calculate exp_date
  let expDate = new Date();
  if (plan === "basic") {
    expDate.setMonth(expDate.getMonth() + 1);
  } else if (plan === "annual" || plan === "pro") {
    expDate.setMonth(expDate.getMonth() + 12);
  } else {
    return res.status(400).json({ status: "0", message: "Invalid plan type" });
  }

  const formattedExpDate = expDate.toISOString().split("T")[0];

  const insertSql = `
    INSERT INTO sponsor_plan_subscription 
      (payment_type, user_id, pay_id, status, exp_date, created_at)
    VALUES (?, ?, ?, ?, ?, NOW())
  `;
  const insertValues = [
    payment_type,
    user_id,
    confirmResult.id,
    confirmResult.status,
    formattedExpDate,
  ];

  db.query(insertSql, insertValues, (err, result) => {
    if (err) {
      console.error("Insert error:", err);
      return res
        .status(500)
        .json({ status: "2", message: "Insert failed", error: err });
    }

    const updateSql = `
      UPDATE register 
      SET subscription_plan = ?,subscription_exp=?
      WHERE id = ?
    `;
    const updateValues = [plan, formattedExpDate, user_id];

    db.query(updateSql, updateValues, (err2, result2) => {
      if (err2) {
        console.error("Update error:", err2);
        return res
          .status(500)
          .json({ status: "2", message: "Update failed", error: err2 });
      }

      return res.status(200).json({
        status: "1",
        message: "Subscription saved and user updated",
      });
    });
  });
};

//Proposal Sponsor Payment
exports.sponsorPaymentCharge = async (req, res) => {
  const { amount, paymentMethodId } = req.body;

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount, // in cents
      currency: "usd",
      payment_method: paymentMethodId,
      confirm: false, // frontend will confirm
    });

    res
      .status(200)
      .json({ status: "1", clientSecret: paymentIntent.client_secret });
  } catch (error) {
    res.status(500).json({ status: "2", message: error.message });
  }
};

exports.sponsorPaymentSave = (req, res) => {
  const {
    confirmResult,
    proposal_id,
    host_id,
    amount,
    platformpercent,
    selectedTiers,
    user_id,
    ptitle,
    sponsoremail,
    sponsorfullname,
    host_email,
  } = req.body;
  const selectedTiersJson = JSON.stringify(selectedTiers);
  if (!confirmResult?.id || !user_id) {
    return res
      .status(400)
      .json({ status: "0", message: "Missing required data" });
  }

  // Calculate exp_date
  let expDate = new Date();

  const insertSql = `
    INSERT INTO sponsorship_payments 
      (proposal_id,host_id,sponsor_id, selectedtiers, stripe_checkout_id, status, created_at,payment_method,currency,amount,platfromfee)
    VALUES (?, ?, ?, ?, ?, ?, NOW(),?,?,?,?)
  `;
  const insertValues = [
    proposal_id,
    host_id,
    user_id,
    selectedTiersJson,
    confirmResult.id,
    confirmResult.status,
    "stripe",
    "usd",
    amount,
    platformpercent,
  ];

  db.query(insertSql, insertValues, (err, result) => {
    if (err) {
      console.error("Insert error:", err);
      return res
        .status(500)
        .json({ status: "2", message: "Insert failed", error: err });
    }

    // Update is_funded in sponsorshipproposal_export table
    const updateSql = `
  UPDATE sponsorshipproposal_export
  SET is_funded = 1
  WHERE id = ?
`;

    db.query(updateSql, [proposal_id], (updateErr, updateResult) => {
      if (updateErr) {
        console.error("Update error:", updateErr);
        return res
          .status(500)
          .json({ status: "3", message: "Update failed", error: updateErr });
      }
      sendEmailToHostProposalsold(
        host_email,
        ptitle,
        sponsorfullname,
        sponsoremail
      );
      return res.status(200).json({
        status: "1",
        message:
          "Subscription saved, proposal marked as funded, and notification sent.",
      });
    });
  });
};

exports.sponsorPaymentSavePaypal = (req, res) => {
  const {
    confirmResult,
    proposal_id,
    host_id,
    amount,
    user_id,
    platformpercent,
    selectedTiers,
    ptitle,
    sponsoremail,
    sponsorfullname,
    host_email,
  } = req.body;
  const selectedTiersJson = JSON.stringify(selectedTiers);

  if (!confirmResult?.id || !user_id) {
    return res
      .status(400)
      .json({ status: "0", message: "Missing required data" });
  }

  // Calculate exp_date
  let expDate = new Date();

  const insertSql = `
    INSERT INTO sponsorship_payments 
      (proposal_id,host_id,selectedtiers,sponsor_id, paypal_order_id, status, created_at,payment_method,currency,amount,platfromfee)
    VALUES (?, ?, ?, ?, ?, ?, NOW(),?,?,?,?)
  `;
  const insertValues = [
    proposal_id,
    host_id,
    selectedTiersJson,
    user_id,
    confirmResult.id,
    "succeeded",
    "paypal",
    "usd",
    amount,
    platformpercent,
  ];

  db.query(insertSql, insertValues, (err, result) => {
    if (err) {
      console.error("Insert error:", err);
      return res
        .status(500)
        .json({ status: "2", message: "Insert failed", error: err });
    }

    // Update is_funded in sponsorshipproposal_export table
    const updateSql = `
      UPDATE sponsorshipproposal_export
      SET is_funded = 1
      WHERE id = ?
    `;
    db.query(updateSql, [proposal_id], (updateErr, updateResult) => {
      if (updateErr) {
        console.error("Update error:", updateErr);
        return res
          .status(500)
          .json({ status: "3", message: "Update failed", error: updateErr });
      }

      sendEmailToHostProposalsold(
        host_email,
        ptitle,
        sponsorfullname,
        sponsoremail
      );

      return res.status(200).json({
        status: "1",
        message: "Subscription saved and proposal marked as funded",
      });
    });
  });
};

//Email For Host
function sendEmailToHostProposalsold(
  to,
  proposalTitle,
  sponsorName,
  sponsorEmail
) {
  const subject = `🎉 A sponsor has sponsored your event proposal!`;

  const body = `
Hello,

Great news! 🎉  
Sponsor **${sponsorName}** has just sponsored your proposal **"${proposalTitle}"** can now contact you.

Or You can contact on "${sponsorEmail}"

Best regards,  
Communitysponsor.org Team`;

  const mailOptions = {
    from: "Communitysponsor.org <avinayquicktech@gmail.com>",
    to,
    subject,
    text: body,
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error("Error sending email:", error);
    } else {
      console.log("Host notification email sent:", info.response);
    }
  });
}

exports.updaterole = (req, res) => {
  let { roles, id } = req.body;

  if (!roles || !id) {
    return res
      .status(400)
      .json({ status: "0", message: "Missing roles or id" });
  }

  // Store roles as JSON string in DB
  const rolesJson = JSON.stringify(roles);

  const updateSql = `UPDATE register SET roles = ? WHERE id = ?`;
  db.query(updateSql, [rolesJson, id], (err, result) => {
    if (err) {
      console.error("Update error:", err);
      return res.status(500).json({ status: "0", message: "Update failed" });
    }
    res.status(200).json({ status: "1", message: "Roles updated" });
  });
};

exports.getallevents = async (req, res) => {
  const { user_id } = req.body;
  const query = `SELECT * FROM events WHERE host_id = ? AND marketplace_requests_enabled IS NULL`;

  db.query(query, [user_id], (err, results) => {
    if (err) {
      return res.status(500).json({
        message: "Database query error",
        error: err,
      });
    }

    res.status(200).json({
      message: "Events fetched",
      results: results,
    });
  });
};

exports.paymentSaveStripe = (req, res) => {
  const {
    confirmResult,
    paytype,
    proposaldetail,
    amount,
    event_id,
    userdata,
    proposal_id,
    eventdetail,
    plan,
    user_id,
  } = req.body;

  if (!confirmResult?.id || !user_id) {
    return res
      .status(400)
      .json({ status: "0", message: "Missing required data" });
  }

  var unlock_count = "0";
  if (paytype === "Single Unlock") {
    unlock_count = "1";
  }
  if (paytype === "5 Unlocks") {
    unlock_count = "5";
  }
  if (paytype === "15 Unlocks") {
    unlock_count = "15";
  }
  var date = new Date();

  // Insert into payment_lockunlock_newrecord as before
  const insertSqln = `INSERT INTO payment_lockunlock_newrecord
      (sponsor_id, proposal_id, payment_type, pay_id, status, lock_type, amount, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`;
  const insertValuesn = [
    user_id,
    proposal_id,
    "Stripe",
    confirmResult.id,
    confirmResult.status,
    paytype,
    amount,
    date,
  ];

  db.query(insertSqln, insertValuesn, (err, result) => {
    if (err) {
      console.error("Insert error:", err);
      return res
        .status(500)
        .json({ status: "2", message: "Insert failed", error: err });
    }

    // Now check if record exists for this sponsor_id (user_id)
    const selectSql = `SELECT unlock_count, proposal_id FROM payment_lockunlock WHERE sponsor_id = ? LIMIT 1`;
    db.query(selectSql, [user_id], (err, rows) => {
      if (err) {
        console.error("Select error:", err);
        return res
          .status(500)
          .json({ status: "4", message: "Select failed", error: err });
      }

      // If record exists, update it
      if (rows.length > 0) {
        let row = rows[0];
        let existingProposals = [];
        try {
          existingProposals = JSON.parse(row.proposal_id);
          if (!Array.isArray(existingProposals)) {
            existingProposals = [];
          }
        } catch {
          existingProposals = [];
        }

        const pid = parseInt(proposal_id);
        const isProposalExist = existingProposals.includes(pid);

        // If proposal_id is NOT in the array, add it and add unlock_count
        if (!isProposalExist) {
          existingProposals.push(pid);

          // Add current unlock_count to existing unlock_count
          const updatedUnlockCount =
            parseInt(row.unlock_count) + parseInt(unlock_count);

          // Update with new unlock_count and appended proposal_id list
          const updateSql = `
      UPDATE payment_lockunlock 
      SET unlock_count = ?, proposal_id = ?, payment_type = ?, pay_id = ?, status = ?, lock_type = ?, amount = ?, created_at = NOW()
      WHERE sponsor_id = ?
    `;
          const updateValues = [
            updatedUnlockCount.toString(),
            JSON.stringify(existingProposals),
            "Stripe",
            confirmResult.id,
            confirmResult.status,
            paytype,
            amount,
            user_id,
          ];

          db.query(updateSql, updateValues, (err, updateResult) => {
            if (err) {
              console.error("Update error:", err);
              return res
                .status(500)
                .json({ status: "5", message: "Update failed", error: err });
            }

            res.status(200).json({
              message:
                "Record updated successfully with new proposal_id and unlock_count",
              results: "",
            });
          });
        } else {
          // proposal_id already exists, so update other fields except unlock_count and proposal_id
          const updateSql = `
      UPDATE payment_lockunlock 
      SET payment_type = ?, pay_id = ?, status = ?, lock_type = ?, amount = ?, created_at = NOW()
      WHERE sponsor_id = ?
    `;
          const updateValues = [
            "Stripe",
            confirmResult.id,
            confirmResult.status,
            paytype,
            amount,
            user_id,
          ];

          db.query(updateSql, updateValues, (err, updateResult) => {
            if (err) {
              console.error("Update error:", err);
              return res
                .status(500)
                .json({ status: "5", message: "Update failed", error: err });
            }

            res.status(200).json({
              message:
                "Record updated successfully without changing unlock_count (proposal_id exists)",
              results: "",
            });
          });
        }
      } else {
        // If no record exists, insert new with proposal_id as array string [proposal_id]
        const insertSql = `
          INSERT INTO payment_lockunlock
          (usage_count,unlock_count, sponsor_id, proposal_id, payment_type, pay_id, status, lock_type, amount, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
        `;
        const insertValues = [
          "1",
          unlock_count,
          user_id,
          JSON.stringify([parseInt(proposal_id)]),
          "Stripe",
          confirmResult.id,
          confirmResult.status,
          paytype,
          amount,
          date,
        ];

        db.query(insertSql, insertValues, (err, insertResult) => {
          if (err) {
            console.error("Insert error:", err);
            return res
              .status(500)
              .json({ status: "6", message: "Insert failed", error: err });
          }
          sendEmailToHostForProposal(
            proposaldetail.created_by,
            proposaldetail.title,
            eventdetail?.title,
            userdata.full_name
          );
          res.status(200).json({
            message: "Record inserted successfully",
            results: "",
          });
        });
      }
    });
  });
};
//Email For Host
function sendEmailToHostForProposal(
  to,
  proposalTitle,
  eventTitle,
  sponsorName
) {
  const subject = `🎉 A sponsor has unlocked your event proposal!`;

  const body = `
Hello,

Great news! 🎉  
Sponsor **${sponsorName}** has just unlocked your proposal **"${proposalTitle}"** for the event **"${eventTitle}"** and can now contact you.

You can now connect and move forward with your event plans.

Best regards,  
Communitysponsor.org Team
  `;

  const mailOptions = {
    from: "Communitysponsor.org <avinayquicktech@gmail.com>",
    to,
    subject,
    text: body,
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error("Error sending email:", error);
    } else {
      console.log("Host notification email sent:", info.response);
    }
  });
}

exports.getlocksubscriptionDetail = async (req, res) => {
  const { user_id, id } = req.body;
  const query = `SELECT * FROM  payment_lockunlock WHERE sponsor_id = ? order by id desc`;

  db.query(query, [user_id], (err, row) => {
    if (err) {
      return res.status(500).json({
        message: "Database query error",
        error: err,
      });
    }

    res.status(200).json({
      message: "Events fetched",
      results: row,
    });
  });
};
exports.proposalcount = (req, res) => {
  const { user_id, id: id } = req.body;

  if (!user_id || !id) {
    return res.status(400).json({ message: "Missing user_id or proposal_id" });
  }

  // Select the latest record for this sponsor_id
  const selectSql = `SELECT id,usage_count, proposal_id FROM payment_lockunlock WHERE sponsor_id = ? ORDER BY id DESC LIMIT 1`;

  db.query(selectSql, [user_id], (err, rows) => {
    if (err) {
      return res.status(500).json({ message: "DB error", error: err });
    }

    if (rows.length === 0) {
      return res.status(404).json({ message: "No record found to update" });
    }

    var record = rows[0];
    let proposals = [];

    try {
      proposals = JSON.parse(record.proposal_id);
      if (!Array.isArray(proposals)) proposals = [];
    } catch {
      proposals = [];
    }

    const pid = parseInt(id);

    if (!proposals.includes(pid)) {
      proposals.push(pid);
      const currentUsage = Number(record.usage_count);
      const totalUsage = currentUsage + 1;
      const updateSql = `UPDATE payment_lockunlock SET proposal_id = ? , usage_count =? WHERE id = ?`;
      db.query(
        updateSql,
        [JSON.stringify(proposals), totalUsage, record.id],
        (updateErr) => {
          if (updateErr) {
            return res
              .status(500)
              .json({ message: "Update failed", error: updateErr });
          }

          return res.status(200).json({
            message: "proposal_id updated",
            updatedProposalIds: proposals,
          });
        }
      );
    } else {
      // proposal_id already exists, no update needed
      return res.status(200).json({
        message: "proposal_id already exists",
        existingProposalIds: proposals,
      });
    }
  });
};

exports.getUnlockproposal = async (req, res) => {
  const { user_id } = req.body;
  const query = `SELECT pln.id as pln_id,pln.sponsor_id, r.full_name, pln.readmessage, pln.lock_type, pln.amount, spe.id, spe.title, spe.created_by_id FROM sponsorshipproposal_export AS spe JOIN payment_lockunlock_newrecord AS pln ON pln.proposal_id = spe.id JOIN register AS r ON pln.sponsor_id = r.id WHERE spe.created_by_id = ? And pln.readmessage = ? ORDER BY pln.id DESC;`;

  db.query(query, [user_id, "No"], (err, results) => {
    if (err) {
      return res.status(500).json({
        message: "Database query error",
        error: err,
      });
    }

    res.status(200).json({
      message: "Events fetched",
      results: results,
    });
  });
};
exports.UnlockproposalStatusUpdate = async (req, res) => {
  const { id } = req.body;
  const updateSql = `UPDATE payment_lockunlock_newrecord SET readmessage = ?  WHERE id = ?`;
  db.query(updateSql, ["Yes", id], (updateErr) => {
    if (updateErr) {
      return res
        .status(500)
        .json({ message: "Update failed", error: updateErr });
    }

    return res.status(200).json({
      message: "proposal_id updated",
    });
  });
};

exports.getproposalDetailEdit = async (req, res) => {
  const { user_id, id } = req.body;
  const query = `SELECT * from sponsorshipproposal_export where id = ? And created_by_id = ?`;

  db.query(query, [id, user_id], (err, results) => {
    if (err) {
      return res.status(500).json({
        message: "Database query error",
        error: err,
      });
    }

    res.status(200).json({
      message: "Events fetched",
      results: results,
    });
  });
};

exports.adminproposalDataEdit = async (req, res) => {
  const data = req.body;

  const {
    id,
    event_type,
    title,
    eventId,
    description,
    amount_requested,
    sponsorship_type,
    sponsorship_tiers,
    event_reach,
    event_platform_type,
    event_platform_link,
    audience_demographics,
    benefits,
    purchased_addons,
    email_blast_sent,
    analytics_enabled,
    is_featured,
    status,
    images,
    video_links,
    location,
    spnotes,
    numfamily,
    highlight,
    deadline,
    ticketsOnSale,
    ticketPrice,
    created_by_id,
  } = data;

  const created_at = new Date();

  const updateQuery = `
  UPDATE sponsorshipproposal_export
  SET
    event_type = ?,
    title = ?,
    event_id = ?,
    description = ?,
    amount_requested = ?,
    sponsorship_type = ?,
    sponsorship_tiers = ?,
    event_reach = ?,
    event_platform_type = ?,
    event_platform_link = ?,
    audience_demographics = ?,
    benefits = ?,
    purchased_addons = ?,
    email_blast_sent = ?,
    analytics_enabled = ?,
    is_featured = ?,
    status = ?,
    images = ?,
    video_links = ?,
    location = ?,
    spnotes = ?,
    numfamily = ?,
    highlight = ?,
    deadline = ?,
    ticketsOnSale = ?,
    ticketPrice = ?,
    created_date = ?,
    created_by_id = ?
  WHERE id = ?
`;
  let videoLinksToStore;
  if (Array.isArray(video_links)) {
    videoLinksToStore = JSON.stringify(video_links);
  } else if (typeof video_links === "string") {
    videoLinksToStore = video_links;
  } else {
    videoLinksToStore = "[]";
  }
  let imagesToStore;
  if (Array.isArray(images)) {
    imagesToStore = JSON.stringify(images);
  } else if (typeof images === "string") {
    // already a JSON string from DB, use as is
    imagesToStore = images;
  } else {
    imagesToStore = "[]"; // fallback empty array
  }

  let benefitsStore;
  if (Array.isArray(benefits)) {
    benefitsStore = JSON.stringify(benefits);
    console.log(benefitsStore);
  } else if (typeof benefits === "string") {
    // already a JSON string from DB, use as is
    benefitsStore = benefits;
  } else {
    benefitsStore = "[]"; // fallback empty array
  }

  let sponsorship_tiersStore;
  if (Array.isArray(sponsorship_tiers)) {
    sponsorship_tiersStore = JSON.stringify(sponsorship_tiers);
  } else if (typeof sponsorship_tiers === "string") {
    // already a JSON string from DB, use as is
    sponsorship_tiersStore = sponsorship_tiers;
  } else {
    sponsorship_tiersStore = "[]"; // fallback empty array
  }

  let purchased_addonsStore;
  if (Array.isArray(purchased_addons)) {
    purchased_addonsStore = JSON.stringify(purchased_addons);
  } else if (typeof purchased_addons === "string") {
    // already a JSON string from DB, use as is
    purchased_addonsStore = purchased_addons;
  } else {
    purchased_addonsStore = "[]"; // fallback empty array
  }

  function formatDateToMySQL(date) {
    if (!date) return null;

    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0"); // Months are 0-based
    const day = String(d.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`; // "YYYY-MM-DD"
  }

  const values = [
    event_type,
    title,
    eventId,
    description,
    amount_requested,
    sponsorship_type,
    sponsorship_tiersStore,
    event_reach,
    event_platform_type,
    event_platform_link,
    audience_demographics,
    benefitsStore,
    purchased_addonsStore,
    email_blast_sent,
    analytics_enabled,
    is_featured,
    status,
    imagesToStore,
    videoLinksToStore,
    location,
    spnotes,
    numfamily,
    highlight,
    formatDateToMySQL(deadline),
    ticketsOnSale,
    ticketPrice,
    created_at,
    created_by_id,
    id, // the id of the record to update
  ];
  db.query(updateQuery, values, (err, result) => {
    if (err) {
      console.error("Update Error:", err);
      return res.status(500).json({ message: "Update failed", error: err });
    }

    const getEmailsQuery = `
  SELECT GROUP_CONCAT(email SEPARATOR ', ') AS sponsorEmails
  FROM \`register\`
  WHERE \`current_role\` LIKE '%business_sponsor%'
`;

    db.query(getEmailsQuery, (err, emailResult) => {
      if (err) {
        console.error("Error fetching sponsor emails:", err);
        return res
          .status(500)
          .json({ message: "Error fetching sponsor emails" });
      }
      const sponsorEmails = emailResult[0]?.sponsorEmails || null;

      sendEmailToEditsponsorsbyadmin(sponsorEmails, title, id);
    });

    return res.status(200).json({
      message: "Proposal updated successfully",
      affectedRows: result.affectedRows,
    });
  });
};

exports.proposalDataEdit = async (req, res) => {
  const data = req.body;
  const {
    id,
    event_type,
    title,
    eventId,
    description,
    amount_requested,
    sponsorship_type,
    sponsorship_tiers,
    event_reach,
    event_platform_type,
    event_platform_link,
    audience_demographics,
    benefits,
    purchased_addons,
    email_blast_sent,
    analytics_enabled,
    is_featured,
    status,
    images,
    video_links,
    location,
    spnotes,
    numfamily,
    highlight,
    deadline,
    ticketsOnSale,
    ticketPrice,
    created_by,
    created_by_id,
  } = data;

  const created_at = new Date();

  const updateQuery = `
  UPDATE sponsorshipproposal_export
  SET
    event_type = ?,
    title = ?,
    event_id = ?,
    description = ?,
    amount_requested = ?,
    sponsorship_type = ?,
    sponsorship_tiers = ?,
    event_reach = ?,
    event_platform_type = ?,
    event_platform_link = ?,
    audience_demographics = ?,
    benefits = ?,
    purchased_addons = ?,
    email_blast_sent = ?,
    analytics_enabled = ?,
    is_featured = ?,
    status = ?,
    images = ?,
    video_links = ?,
    location = ?,
    spnotes = ?,
    numfamily = ?,
    highlight = ?,
    deadline = ?,
    ticketsOnSale = ?,
    ticketPrice = ?,
    created_date = ?,
    created_by = ?,
    created_by_id = ?
  WHERE id = ?
`;
  let videoLinksToStore;
  if (Array.isArray(video_links)) {
    videoLinksToStore = JSON.stringify(video_links);
  } else if (typeof video_links === "string") {
    videoLinksToStore = video_links;
  } else {
    videoLinksToStore = "[]";
  }
  let imagesToStore;
  if (Array.isArray(images)) {
    imagesToStore = JSON.stringify(images);
  } else if (typeof images === "string") {
    // already a JSON string from DB, use as is
    imagesToStore = images;
  } else {
    imagesToStore = "[]"; // fallback empty array
  }

  let benefitsStore;
  if (Array.isArray(benefits)) {
    benefitsStore = JSON.stringify(benefits);
    console.log(benefitsStore);
  } else if (typeof benefits === "string") {
    // already a JSON string from DB, use as is
    benefitsStore = benefits;
  } else {
    benefitsStore = "[]"; // fallback empty array
  }

  let sponsorship_tiersStore;
  if (Array.isArray(sponsorship_tiers)) {
    sponsorship_tiersStore = JSON.stringify(sponsorship_tiers);
  } else if (typeof sponsorship_tiers === "string") {
    // already a JSON string from DB, use as is
    sponsorship_tiersStore = sponsorship_tiers;
  } else {
    sponsorship_tiersStore = "[]"; // fallback empty array
  }

  let purchased_addonsStore;
  if (Array.isArray(purchased_addons)) {
    purchased_addonsStore = JSON.stringify(purchased_addons);
  } else if (typeof purchased_addons === "string") {
    // already a JSON string from DB, use as is
    purchased_addonsStore = purchased_addons;
  } else {
    purchased_addonsStore = "[]"; // fallback empty array
  }

  function formatDateToMySQL(date) {
    if (!date) return null;

    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0"); // Months are 0-based
    const day = String(d.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`; // "YYYY-MM-DD"
  }

  const values = [
    event_type,
    title,
    eventId,
    description,
    amount_requested,
    sponsorship_type,
    sponsorship_tiersStore,
    event_reach,
    event_platform_type,
    event_platform_link,
    audience_demographics,
    benefitsStore,
    purchased_addonsStore,
    email_blast_sent,
    analytics_enabled,
    is_featured,
    status,
    imagesToStore,
    videoLinksToStore,
    location,
    spnotes,
    numfamily,
    highlight,
    formatDateToMySQL(deadline),
    ticketsOnSale,
    ticketPrice,
    created_at,
    created_by,
    created_by_id,
    id, // the id of the record to update
  ];
  db.query(updateQuery, values, (err, result) => {
    if (err) {
      console.error("Update Error:", err);
      return res.status(500).json({ message: "Update failed", error: err });
    }

    const getEmailsQuery = `
  SELECT GROUP_CONCAT(email SEPARATOR ', ') AS sponsorEmails
  FROM \`register\`
  WHERE \`current_role\` LIKE '%business_sponsor%'
`;

    db.query(getEmailsQuery, (err, emailResult) => {
      if (err) {
        console.error("Error fetching sponsor emails:", err);
        return res
          .status(500)
          .json({ message: "Error fetching sponsor emails" });
      }
      const sponsorEmails = emailResult[0]?.sponsorEmails || null;
      console.log(created_by, id);
      sendEmailToEditsponsors(sponsorEmails, title, created_by, id);
    });

    return res.status(200).json({
      message: "Proposal updated successfully",
      affectedRows: result.affectedRows,
    });
  });
};

// controller/sponsorController.js

exports.updateSponsorSetup = (req, res) => {
  const { userLogin, radius, demographics } = req.body;

  // Basic validation
  if (!userLogin.id) {
    return res.status(400).json({
      status: "0",
      message: "Missing sponsor id",
    });
  }

  // Convert demographics to JSON if it's an array
  const demographicsJson = Array.isArray(demographics)
    ? JSON.stringify(demographics)
    : demographics || null;

  const updateSql = `
    UPDATE register 
    SET radius = ?, demographics = ?
    WHERE id = ?
  `;

  db.query(
    updateSql,
    [radius || null, demographicsJson, userLogin.id],
    (err, result) => {
      if (err) {
        console.error("Update error:", err);
        return res.status(500).json({
          status: "0",
          message: "Update failed",
          error: err.message,
        });
      }

      if (result.affectedRows === 0) {
        return res.status(404).json({
          status: "0",
          message: "No sponsor found with the given id",
        });
      }

      res.status(200).json({
        status: "1",
        message: "Sponsor setup updated successfully",
      });
    }
  );
};

exports.getuser = async (req, res) => {
  var id = req.body.id;

  const query = `SELECT * FROM register WHERE id =?`;

  db.query(query, [id], (err, row) => {
    if (err) {
      return res.status(500).json({
        message: "Database query error",
        error: err,
      });
    }

    res.status(200).json({
      message: ``,
      results: row,
    });
  });
};

exports.updatesponserPayout = async (req, res) => {
  try {
    const { id, paypal_email } = req.body;

    // 1️⃣ Validate input
    if (
      typeof id !== "number" ||
      !paypal_email ||
      typeof paypal_email !== "string"
    ) {
      return res.status(400).json({
        message:
          "Invalid input: 'id' must be a number and 'paypal_email' must be a string",
      });
    }

    // 2️⃣ Optional: check if user exists first
    const checkQuery = `SELECT id, paypalemailaddress FROM register WHERE id = ?`;
    db.query(checkQuery, [id], (checkErr, checkResult) => {
      if (checkErr) {
        console.error("DB check error:", checkErr);
        return res
          .status(500)
          .json({ message: "Database error", error: checkErr });
      }

      if (checkResult.length === 0) {
        return res.status(404).json({ message: "User not found" });
      }

      console.log("Current user data:", checkResult[0]);

      // 3️⃣ Update the user
      const updateQuery = `UPDATE register SET paypalemailaddress = ? WHERE id = ?`;
      db.query(updateQuery, [paypal_email, id], (updateErr, updateResult) => {
        if (updateErr) {
          console.error("DB update error:", updateErr);
          return res
            .status(500)
            .json({ message: "Database update error", error: updateErr });
        }

        console.log("Update result:", updateResult);

        if (updateResult.affectedRows === 0) {
          return res
            .status(500)
            .json({ message: "Update failed: no rows affected" });
        }

        // 4️⃣ Success
        return res.status(200).json({
          message: "Payout updated successfully",
          updatedId: id,
          oldValue: checkResult[0].paypalemailaddress,
          newValue: paypal_email,
        });
      });
    });
  } catch (err) {
    console.error("Unexpected error:", err);
    return res
      .status(500)
      .json({ message: "Unexpected server error", error: err });
  }
};
exports.edituserdata = async (req, res) => {
  try {
    const {
      stripe_account_id,
      userId,
      full_name,
      email,
      company_name,
      phone,
      website,
      location,
      industry,
      bio,
    } = req.body;

    // Validate required fields
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    // Check if email is being updated and if it already exists in other accounts
    if (email !== undefined) {
      const emailCheckQuery = `SELECT id FROM register WHERE email = ? AND id != ?`;

      console.log("Checking email:", email, "for user ID:", userId); // Debug log

      db.query(emailCheckQuery, [email, userId], (emailErr, emailResult) => {
        if (emailErr) {
          console.error("Database error in email check:", emailErr);
          return res.status(500).json({
            success: false,
            message: "Database query error",
            error: emailErr.message,
          });
        }

        console.log("Email check result:", emailResult); // Debug log

        // If email exists in another account
        if (emailResult.length > 0) {
          return res.status(400).json({
            success: false,
            message: "Email already exists in another account",
          });
        }

        // If email is available, proceed with update
        proceedWithUpdate();
      });
    } else {
      // If email is not being updated, proceed directly
      proceedWithUpdate();
    }

    function proceedWithUpdate() {
      // Build update query dynamically based on provided fields
      let updateFields = [];
      let values = [];

      if (full_name !== undefined) {
        updateFields.push("full_name = ?");
        values.push(full_name);
      }
      if (email !== undefined) {
        updateFields.push("email = ?");
        values.push(email);
      }
      if (company_name !== undefined) {
        updateFields.push("company_name = ?");
        values.push(company_name);
      }
      if (phone !== undefined) {
        updateFields.push("phone = ?");
        values.push(phone);
      }
      if (website !== undefined) {
        updateFields.push("website = ?");
        values.push(website);
      }
      if (location !== undefined) {
        updateFields.push("location = ?");
        values.push(location);
      }
      if (industry !== undefined) {
        updateFields.push("industry = ?");
        values.push(industry);
      }
      if (bio !== undefined) {
        updateFields.push("bio = ?");
        values.push(bio);
      }

      if (stripe_account_id !== undefined) {
        updateFields.push("stripe_account_id = ?");
        values.push(stripe_account_id);
      }

      if (updateFields.length === 0) {
        return res.status(400).json({
          success: false,
          message: "No fields to update",
        });
      }

      values.push(userId);

      const query = `UPDATE register SET ${updateFields.join(", ")} WHERE id = ?`;

      db.query(query, values, (err, result) => {
        if (err) {
          console.error("Database error:", err);
          return res.status(500).json({
            success: false,
            message: "Database query error",
            error: err.message,
          });
        }

        if (result.affectedRows === 0) {
          return res.status(404).json({
            success: false,
            message: "User not found",
          });
        }

        res.json({
          success: true,
          message: "User updated successfully",
          affectedRows: result.affectedRows,
        });
      });
    }
  } catch (error) {
    console.error("Error in edituserdata:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

exports.getHistorydetail = async (req, res) => {
  var userid = req.body.user;

  const checkQuery = `SELECT * from register where id = ?`;
  db.query(checkQuery, [userid.id], (checkErr, checkResult) => {
    if (checkErr) {
      console.error("DB check error:", checkErr);
      return res
        .status(500)
        .json({ message: "Database error", error: checkErr });
    }

    if (checkResult.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const user = checkResult[0];
    let roles = [];

    try {
      // Parse the roles JSON string
      if (user.roles) {
        roles = JSON.parse(user.roles);
      }
    } catch (parseErr) {
      console.error("Error parsing roles:", parseErr);
      roles = [];
    }

    // Add current_role to roles if it exists
    if (user.current_role && !roles.includes(user.current_role)) {
      roles.push(user.current_role);
    }

    const paymentPromises = [];
    const results = {
      user: user,
      payments: {
        host_payments: [],
        sponsorship_payments: [],
      },
    };

    // Check if user has event_host role
    if (roles.includes("event_host") || user.current_role === "event_host") {
      const hostPaymentsQuery = `SELECT * FROM host_payments WHERE host_id = ? ORDER BY id DESC`;
      paymentPromises.push(
        new Promise((resolve, reject) => {
          db.query(hostPaymentsQuery, [userid.id], (err, hostResults) => {
            if (err) {
              console.error("Error fetching host payments:", err);
              reject(err);
            } else {
              results.payments.host_payments = hostResults;
              resolve();
            }
          });
        })
      );
    }

    // Check if user has business_sponsor role
    if (
      roles.includes("business_sponsor") ||
      user.current_role === "business_sponsor"
    ) {
      const sponsorshipPaymentsQuery = `SELECT * FROM sponsorship_payments WHERE sponsor_id = ? ORDER BY id DESC`;
      paymentPromises.push(
        new Promise((resolve, reject) => {
          db.query(
            sponsorshipPaymentsQuery,
            [userid.id],
            (err, sponsorResults) => {
              if (err) {
                console.error("Error fetching sponsorship payments:", err);
                reject(err);
              } else {
                results.payments.sponsorship_payments = sponsorResults;
                resolve();
              }
            }
          );
        })
      );
    }

    // If no specific roles found, check both tables by user ID
    if (paymentPromises.length === 0) {
      const hostPaymentsQuery = `SELECT * FROM host_payments WHERE host_id = ? ORDER BY id DESC`;
      const sponsorshipPaymentsQuery = `SELECT * FROM sponsorship_payments WHERE sponsor_id = ? ORDER BY id DESC`;

      paymentPromises.push(
        new Promise((resolve, reject) => {
          db.query(hostPaymentsQuery, [userid.id], (err, hostResults) => {
            if (err) {
              console.error("Error fetching host payments:", err);
              reject(err);
            } else {
              results.payments.host_payments = hostResults;
              resolve();
            }
          });
        })
      );

      paymentPromises.push(
        new Promise((resolve, reject) => {
          db.query(
            sponsorshipPaymentsQuery,
            [userid.id],
            (err, sponsorResults) => {
              if (err) {
                console.error("Error fetching sponsorship payments:", err);
                reject(err);
              } else {
                results.payments.sponsorship_payments = sponsorResults;
                resolve();
              }
            }
          );
        })
      );
    }

    // Execute all queries
    Promise.all(paymentPromises)
      .then(() => {
        res.status(200).json({
          message: "Payment history retrieved successfully",
          data: results,
        });
      })
      .catch((error) => {
        console.error("Error in payment queries:", error);
        res.status(500).json({
          message: "Error fetching payment history",
          error: error,
        });
      });
  });
};

exports.weeklyaggregate = async (req, res) => {
  try {
    // Get proposals that are 7 days old and not funded
    const proposalQuery = `
      SELECT * FROM sponsorshipproposal_export 
      WHERE is_funded = 0 
     AND created_date >= DATE_SUB(NOW(), INTERVAL 7 DAY)
      AND created_date < DATE_SUB(NOW(), INTERVAL 6 DAY)
    `;

    db.query(proposalQuery, async (proposalErr, proposals) => {
      if (proposalErr) {
        console.error("Database error fetching proposals:", proposalErr);
        return res.status(500).json({
          message: "Database error fetching proposals",
          error: proposalErr,
        });
      }

      if (proposals.length === 0) {
        return res.status(200).json({
          message: "No proposals found that are 7 days old and not funded",
          proposalsCount: 0,
          emailsSent: 0,
        });
      }

      // Get all users with business_sponsor role
      const sponsorQuery = `
        SELECT * FROM register 
        WHERE roles LIKE '%business_sponsor%' 
        OR current_role = 'business_sponsor'
        OR roles = 'business_sponsor'
      `;

      db.query(sponsorQuery, async (sponsorErr, sponsors) => {
        if (sponsorErr) {
          console.error("Database error fetching sponsors:", sponsorErr);
          return res.status(500).json({
            message: "Database error fetching sponsors",
            error: sponsorErr,
          });
        }

        if (sponsors.length === 0) {
          return res.status(404).json({
            message: "No business sponsors found",
            proposalsCount: proposals.length,
            emailsSent: 0,
          });
        }

        console.log(
          `Found ${proposals.length} proposals and ${sponsors.length} sponsors`
        );

        // Send emails to all sponsors about these proposals
        const emailPromises = sponsors.map((sponsor) => {
          const mailOptions = {
            from: `"Community Sponsor" <${process.env.EMAIL_USER}>`,
            to: sponsor.email,
            subject: `Weekly Sponsorship Opportunities - ${proposals.length} New Proposals Available`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="text-align: center; margin-bottom: 30px;">
                  <h1 style="color: #2563eb; margin: 0; font-size: 28px;">CommunitySponsor</h1>
                  <p style="color: #6b7280; margin: 5px 0 0 0; font-size: 14px;">Weekly Sponsorship Opportunities</p>
                </div>
                
                <div style="background: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 30px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                  <h2 style="color: #1f2937; margin-top: 0; font-size: 24px;">New Sponsorship Opportunities Available!</h2>
                  
                  <p style="color: #374151; line-height: 1.6; font-size: 16px; margin-bottom: 20px;">
                    Hello ${sponsor.full_name || "Sponsor"},
                  </p>
                  
                  <p style="color: #374151; line-height: 1.6; font-size: 16px; margin-bottom: 20px;">
                    We have <strong>${proposals.length}</strong> new sponsorship proposals that need funding. 
                    These proposals were created last week and are looking for sponsors like you!
                  </p>

                  <div style="background: #f8fafc; padding: 20px; border-radius: 6px; margin: 20px 0;">
                    <h3 style="color: #1f2937; margin-top: 0; margin-bottom: 15px;">Featured Proposals:</h3>
                    ${proposals
                      .slice(0, 5)
                      .map(
                        (proposal, index) => `
                      <div style="border-bottom: 1px solid #e5e7eb; padding: 10px 0; ${index === proposals.slice(0, 5).length - 1 ? "border-bottom: none;" : ""}">
                        <h4 style="color: #2563eb; margin: 0 0 5px 0; font-size: 16px;">${proposal.title || "Untitled Proposal"}</h4>
                        <p style="color: #6b7280; margin: 0; font-size: 14px;">
                          ${proposal.event_type || "Event"} • 
                          ${proposal.location || "Location not specified"} • 
                          Requested: ${proposal.amount_requested || "N/A"}
                        </p>
                        ${proposal.description ? `<p style="color: #374151; margin: 5px 0 0 0; font-size: 14px;">${proposal.description.substring(0, 100)}...</p>` : ""}
                      </div>
                    `
                      )
                      .join("")}
                    
                    ${
                      proposals.length > 5
                        ? `
                      <p style="color: #6b7280; margin: 15px 0 0 0; font-size: 14px; text-align: center;">
                        ... and ${proposals.length - 5} more proposals
                      </p>
                    `
                        : ""
                    }
                  </div>

                  <div style="text-align: center; margin: 25px 0;">
                    <a href="https://communitysponsor.org/browseproposals" 
                       style="background: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
                      View All Proposals
                    </a>
                  </div>

                  <p style="color: #374151; line-height: 1.6; font-size: 14px;">
                    Don't miss out on these great opportunities to support your community and get valuable exposure for your business.
                  </p>
                </div>
                
                <div style="margin-top: 30px; padding: 20px; background: #f8fafc; border-radius: 8px; text-align: center;">
                  <p style="color: #666; margin: 0 0 10px 0;">
                    Best regards,<br>
                    <strong>The CommunitySponsor Team</strong>
                  </p>
                </div>
                
                <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center;">
                  <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                    This email was sent to ${sponsor.full_name || sponsor.email} as part of our weekly sponsorship opportunities update.<br>
                    &copy; ${new Date().getFullYear()} CommunitySponsor.org. All rights reserved.
                  </p>
                  <p style="color: #9ca3af; font-size: 12px; margin: 5px 0 0 0;">
                    <a href="https://communitysponsor.org/unsubscribe" style="color: #3b82f6; text-decoration: none;">Unsubscribe from these notifications</a>
                  </p>
                </div>
              </div>
            `,
          };

          return transporter.sendMail(mailOptions);
        });

        try {
          await Promise.all(emailPromises);

          // Log this activity
          const logQuery = `
            INSERT INTO weekly_aggregate_log 
            (proposals_count, sponsors_count, sent_date) 
            VALUES (?, ?, NOW())
          `;

          db.query(logQuery, [proposals.length, sponsors.length], (logErr) => {
            if (logErr) {
              console.error("Error logging weekly aggregate:", logErr);
            }
          });

          res.status(200).json({
            message: `Weekly aggregate email sent successfully to ${sponsors.length} sponsors about ${proposals.length} proposals`,
            proposalsCount: proposals.length,
            sponsorsCount: sponsors.length,
            emailsSent: sponsors.length,
          });
        } catch (emailError) {
          console.error("Error sending emails:", emailError);
          res.status(500).json({
            message: "Error sending some emails",
            error: emailError,
            proposalsCount: proposals.length,
            sponsorsCount: sponsors.length,
            emailsSent: 0,
          });
        }
      });
    });
  } catch (error) {
    console.error("Error in weeklyaggregate:", error);
    res.status(500).json({
      message: "Server error",
      error: error,
    });
  }
};
