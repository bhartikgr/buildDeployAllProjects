const db = require("../../db");
const nodemailer = require("nodemailer");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
require("dotenv").config();
//Email Detail
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});
exports.createproposalAgent = async (req, res) => {
  const data = req.body;

  const {
    inviteUrl,
    proposal_id,
    host_id,
    agent_email,
    role,
    commission_rate,
    status,
    invite_token,
    referral_code,
    proposal,
    userdata,
  } = data;

  const created_at = new Date();
  const query = `SELECT * from proposal_agents where proposal_id = ? And host_id =? And agent_email =?`;

  db.query(query, [proposal_id, host_id, agent_email], (err, results) => {
    if (err) {
      return res.status(500).json({
        message: "Database query error",
        error: err,
      });
    }

    if (results.length > 0) {
      return res.status(201).json({
        message: "This is already sent",
        status: "2",
      });
    } else {
      // ✅ Fetch user_id from register table
      const userQuery = `SELECT id FROM register WHERE email = ? LIMIT 1`;
      db.query(userQuery, [agent_email], (err, userResult) => {
        if (err) {
          return res.status(500).json({
            message: "Database query error (register)",
            error: err,
          });
        }

        let agent_user_id = null;
        let finalStatus = status;
        if (userResult.length > 0) {
          agent_user_id = userResult[0].id;
          finalStatus = "active";
        }

        const insertQuery = `
          INSERT INTO proposal_agents (
            proposal_id,
            host_id,
            agent_email,
            role,
            commission_rate,
            status,
            invite_token,
            referral_code,
            agent_user_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const values = [
          proposal_id,
          host_id,
          agent_email,
          role,
          commission_rate,
          finalStatus,
          invite_token,
          referral_code,
          agent_user_id, // ✅ new column
        ];

        db.query(insertQuery, values, (err, result) => {
          if (err) {
            console.error("Insert Error:", err);
            return res
              .status(500)
              .json({ message: "Insert failed", error: err });
          }
          sendProposalEmail(agent_email, proposal, userdata, inviteUrl);
          console.log(proposal.title);
          return res.status(201).json({
            message: "Proposal agent created successfully",
            insertId: result.insertId,
            status: "1",
          });
        });
      });
    }
  });
};

function sendProposalEmail(to, proposal, message, inviteUrl) {
  const mailOptions = {
    from: "Communitysponsor.org",
    to,
    subject: `You've been invited to collaborate on "${proposal.title}"`,
    html: `
          <p>Hi there,</p>
          <p>${message.full_name} (${message.company_name}) has invited you to collaborate on their sponsorship proposal, "${proposal.title}".</p>
          <p>To accept the invitation and get started, click the link below:</p>
          <p><a href="${inviteUrl}" style="background-color: #10b981; color: white; padding: 12px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Accept Invitation</a></p>
          <p>This link is unique to you and should not be shared.</p>
          <p>Thanks,<br/>The CommunitySponsor Team</p>
        `,
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) console.error("Error sending email:", error);
    else console.log(`✅ Reminder email sent to ${to}`);
  });
}

exports.getProposalAgent = async (req, res) => {
  var data = req.body;

  const query = `SELECT * from proposal_agents where proposal_id = ?`;

  db.query(query, [data.proposal_id], (err, results) => {
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

exports.deleteAgent = async (req, res) => {
  const { agentId } = req.body;

  const query = `DELETE FROM proposal_agents WHERE id = ?`;

  db.query(query, [agentId], (err, result) => {
    if (err) {
      return res.status(500).json({
        message: "Failed to delete agent",
        error: err,
      });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({
        message: "Agent not found or already deleted",
      });
    }

    res.status(200).json({
      message: "Agent deleted successfully",
      deletedId: agentId,
    });
  });
};
exports.marketplaceProposal = async (req, res) => {
  const query = `SELECT *  FROM marketplaceproposal WHERE is_active = ? order by id desc`;

  db.query(query, ["1"], (err, results) => {
    if (err) {
      return res.status(500).json({
        message: "Failed to delete agent",
        error: err,
      });
    }

    res.status(200).json({
      message: "Agent deleted successfully",
      results: results,
    });
  });
};
exports.sponsorshipProposal = async (req, res) => {
  const { id } = req.body; // expecting id: [1,2,3]

  if (!id || !Array.isArray(id) || id.length === 0) {
    return res.status(400).json({ message: "Invalid ID list" });
  }

  const query = `SELECT * FROM sponsorshipproposal_export WHERE id IN (?)`;

  db.query(query, [id], (err, results) => {
    if (err) {
      return res.status(500).json({
        message: "Failed to fetch proposals",
        error: err,
      });
    }

    res.status(200).json({
      message: "Proposals fetched successfully",
      results,
    });
  });
};

exports.agentApplication = async (req, res) => {
  var data = req.body;
  const query = `SELECT *  FROM proposal_agents WHERE agent_user_id = ? order by id desc`;

  db.query(query, [data.agent_user_id], (err, results) => {
    if (err) {
      return res.status(500).json({
        message: "Failed to delete agent",
        error: err,
      });
    }

    res.status(200).json({
      message: "",
      results: results,
    });
  });
};
exports.proposalAgentfilter = async (req, res) => {
  var data = req.body;
  const query = `SELECT *  FROM proposal_agents WHERE invite_token = ? And status =?`;
  db.query(query, [data.invite_token, data.status], (err, row) => {
    if (err) {
      return res.status(500).json({
        message: "Failed to delete agent",
        error: err,
      });
    }

    res.status(200).json({
      message: "",
      results: row,
    });
  });
};
exports.createAgentAccount = async (req, res) => {
  var data = req.body;
  const hashedPassword = await bcrypt.hash(data.password, 10);
  var usertype = JSON.stringify([data.user_type]);
  // Step 3: Insert into database
  const insertQuery = `
      INSERT INTO register (
        \`full_name\`,
        \`email\`,
        \`password\`,
        \`viewpassword\`,
        \`current_role\`,
        \`roles\`,
        \`created_at\`
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

  const values = [
    data.full_name,
    data.email,
    hashedPassword,
    data.password,
    data.user_type,
    usertype,
    new Date(),
  ];

  db.query(insertQuery, values, (insertErr, result) => {
    if (insertErr) {
      return res
        .status(500)
        .json({ message: "Insert failed", error: insertErr });
    }
    const insertedId = result.insertId;
    const updateSql = `
      UPDATE  proposal_agents 
      SET agent_user_id = ?, status=?
      WHERE invite_token = ?
    `;
    const updateValues = [insertedId, "active", data.token];

    db.query(updateSql, updateValues, (err2, result2) => {
      if (err2) {
        console.error("Update error:", err2);
        return res
          .status(500)
          .json({ status: "2", message: "Update failed", error: err2 });
      }
      res.status(200).json({
        message: "Account created successfully",
        results: "",
      });
    });
  });
};

exports.proposalAgentassistant = async (req, res) => {
  var data = req.body;
  const query = `SELECT *  FROM proposal_agents WHERE agent_user_id = ? And status =?`;
  db.query(query, [data.agent_user_id, data.status], (err, results) => {
    if (err) {
      return res.status(500).json({
        message: "Failed to delete agent",
        error: err,
      });
    }

    res.status(200).json({
      message: "",
      results: results,
    });
  });
};
exports.SponsorLead = async (req, res) => {
  var data = req.body;
  const query = `SELECT *  FROM sponsorlead WHERE referred_by_agent_id = ? order by id desc`;
  db.query(query, [data.referred_by_agent_id], (err, results) => {
    if (err) {
      return res.status(500).json({
        message: "Failed to delete agent",
        error: err,
      });
    }

    res.status(200).json({
      message: "",
      results: results,
    });
  });
};
exports.SponsorshipProposalList = async (req, res) => {
  var data = req.body;
  const query = `SELECT *  FROM sponsorshipproposal_export WHERE created_by_id = ? And status =? order by id desc`;
  db.query(query, [data.created_by, "active"], (err, results) => {
    if (err) {
      return res.status(500).json({
        message: "Failed to delete agent",
        error: err,
      });
    }

    res.status(200).json({
      message: "",
      results: results,
    });
  });
};

exports.MarketplaceProposalList = async (req, res) => {
  var data = req.body;
  const query = `SELECT *  FROM marketplaceproposal WHERE host_id = ? order by id desc`;

  db.query(query, [data.host_id], (err, results) => {
    if (err) {
      return res.status(500).json({
        message: "Failed to delete agent",
        error: err,
      });
    }

    res.status(200).json({
      message: "Agent deleted successfully",
      results: results,
    });
  });
};

exports.MarketplaceProposalCreate = async (req, res) => {
  const data = req.body;

  // destructure & normalize values
  const {
    proposal_id,
    host_id,
    commission_rate,
    commission_description,
    max_agents,
    marketplace_description,
    target_locations,
    preferred_agent_experience,
    is_active,
    listing_fee_paid,
  } = data;

  // convert array fields to string for SQL (since target_locations is TEXT)
  const targetLocationsStr = Array.isArray(target_locations)
    ? JSON.stringify(target_locations) // convert array to JSON
    : JSON.stringify([target_locations]); // wrap single value in array

  const query = `
    INSERT INTO marketplaceproposal 
    (proposal_id, host_id, commission_rate, commission_description, max_agents, marketplace_description, target_locations, preferred_agent_experience, is_active, listing_fee_paid) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const values = [
    proposal_id,
    host_id,
    commission_rate,
    commission_description,
    max_agents,
    marketplace_description,
    targetLocationsStr,
    preferred_agent_experience,
    is_active ? 1 : 0,
    listing_fee_paid ? "1" : "0",
  ];

  db.query(query, values, (err, results) => {
    if (err) {
      return res.status(500).json({
        message: "Failed to insert marketplace proposal",
        error: err,
      });
    }

    res.status(201).json({
      message: "Marketplace proposal created successfully",
      insertId: results.insertId,
    });
  });
};
exports.HostPurchaseCreate = async (req, res) => {
  const data = req.body;

  const {
    user_id,
    purchase_type,
    item_description,
    item_details,
    amount,
    transaction_id,
    payment_method,
    status,
  } = data;

  // proposal_id is required in table but not in request
  // If you don't have one, set it as NULL or empty string
  const proposal_id = data.proposal_id || null;

  // stringify item_details because column is LONGTEXT
  const itemDetailsStr = JSON.stringify(item_details);

  // currency default: "usd"
  const currency = data.currency || "usd";

  // default created_at
  const created_at = new Date();

  const query = `
    INSERT INTO hostpurchase 
    (user_id, proposal_id, purchase_type, item_description, item_details, amount, currency, payment_method, transaction_id, status, created_at) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const values = [
    user_id,
    proposal_id,
    purchase_type,
    item_description,
    itemDetailsStr,
    amount,
    currency,
    payment_method,
    transaction_id,
    status || "succeeded",
    created_at,
  ];

  db.query(query, values, (err, results) => {
    if (err) {
      return res.status(500).json({
        message: "Failed to insert host purchase",
        error: err,
      });
    }

    res.status(201).json({
      message: "Host purchase created successfully",
      insertId: results.insertId,
    });
  });
};

exports.getMarketplaceProposal = async (req, res) => {
  var data = req.body;
  console.log(data);
  const query = `SELECT *  FROM marketplaceproposal WHERE id = ?`;

  db.query(query, [data.id], (err, row) => {
    if (err) {
      return res.status(500).json({
        message: "Failed to delete agent",
        error: err,
      });
    }

    res.status(200).json({
      message: "",
      results: row,
    });
  });
};
exports.getSponsorshipProposal = async (req, res) => {
  var data = req.body;
  const query = `SELECT *  FROM sponsorshipproposal_export WHERE id = ?`;

  db.query(query, [data.id], (err, row) => {
    if (err) {
      return res.status(500).json({
        message: "Failed to delete agent",
        error: err,
      });
    }

    res.status(200).json({
      message: "",
      results: row,
    });
  });
};
exports.AgentApplicationCreate = async (req, res) => {
  const data = req.body;
  const {
    title,
    agent_detail,
    proposal_id,
    agent_user_id,
    host_id,
    application_message,
    agent_experience,
    market_id,
  } = data;

  // 1️⃣ Check if an application already exists
  const checkQuery = `
    SELECT proposal_id, agent_user_id
    FROM agent_applications
    WHERE proposal_id = ? AND agent_user_id = ?
  `;

  db.query(checkQuery, [proposal_id, agent_user_id], (err, results) => {
    if (err) {
      return res
        .status(500)
        .json({ message: "Failed to check existing application", error: err });
    }

    if (results.length > 0) {
      // Already exists — do not insert
      return res.status(200).json({ message: "Application already exists" });
    }

    // 2️⃣ Insert new application
    const insertQuery = `
      INSERT INTO agent_applications 
      (proposal_id, agent_user_id, host_id, application_message, agent_experience, status)
      VALUES (?, ?, ?, ?, ?, 'pending')
    `;
    const values = [
      proposal_id,
      agent_user_id,
      host_id,
      application_message,
      agent_experience,
    ];

    db.query(insertQuery, values, (err2, insertResult) => {
      if (err2) {
        return res
          .status(500)
          .json({ message: "Failed to insert application", error: err2 });
      }
      const query1 = `SELECT *  FROM marketplaceproposal WHERE id = ?`;
      db.query(query1, [market_id], (err, roww) => {
        if (err) {
          return res.status(500).json({
            message: "Failed to delete agent",
            error: err,
          });
        }
        const updateSql = `
      UPDATE  marketplaceproposal 
      SET current_agents = ?
      WHERE id = ?
    `;
        let count;
        if (roww[0].current_agents === null) {
          count = 1;
        } else {
          count = Number(roww[0].current_agents) + 1;
        }

        const updateValues = [count, market_id];

        db.query(updateSql, updateValues, (err2, result2) => {
          if (err2) {
            console.error("Update error:", err2);
            return res
              .status(500)
              .json({ status: "2", message: "Update failed", error: err2 });
          }
        });
      });

      const query = `SELECT *  FROM register WHERE id = ?`;

      db.query(query, [host_id], (err, row) => {
        if (err) {
          return res.status(500).json({
            message: "Failed to delete agent",
            error: err,
          });
        }
        const hostdetail = row[0];
        sendEmailToHostForAgentApplication(
          hostdetail.email,
          agent_detail.full_name,
          title
        );
      });

      res.status(201).json({
        message: "Application submitted successfully",
        insertId: insertResult.insertId,
      });
    });
  });
};
function sendEmailToHostForAgentApplication(to, agentName, proposalTitle) {
  const mailOptions = {
    from: "Communitysponsor.org",
    to,
    subject: `New Agent Application for "${proposalTitle}"`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <h2 style="color: #0f5132;">New Agent Application Submitted!</h2>
        <p>Hi,</p>
        <p>
          A new agent has submitted an application for your proposal "<strong>${proposalTitle}</strong>".
        </p>
        <p>
          <strong>Agent Name:</strong> ${agentName} <br/>
          You can review the agent's application in your dashboard.
        </p>
        <p style="margin-top: 20px;">
          <a href="https://communitysponsor.org/backend/agenthub" 
             style="background-color:#16a34a; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
             View Application
          </a>
        </p>
        <p>Thank you,<br/>Community Sponsor Team</p>
      </div>
    `,
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) console.error("Error sending email:", error);
    else console.log(`✅ Notification email sent to ${to}`);
  });
}
