const db = require("../../db");

const { dbPromise } = require("../../db"); // dbPromise import karo
const nodemailer = require("nodemailer");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const multer = require("multer");
const path = require("path");
const Stripe = require("stripe");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
require("dotenv").config();
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});
exports.gethostDetails = async (req, res) => {
  var id = req.body.id;

  const query = `SELECT * FROM register WHERE id =?`;

  db.query(query, [id], (err, row) => {
    if (err) {
      return res.status(500).json({
        message: "Database query error",
        error: err,
      });
    }
    if (row.length > 0) {
      res.status(200).json({
        message: ``,
        results: row[0],
      });
    } else {
      res.status(200).json({
        message: ``,
        results: "",
      });
    }
  });
};
exports.chatThread = async (req, res) => {
  var data = req.body;

  const query = `SELECT * FROM chat_threads WHERE proposal_id =? And host_id = ? And sponsor_id =?`;

  db.query(
    query,
    [data.proposal_id, data.host_id, data.sponsor_id],
    (err, results) => {
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
    }
  );
};
exports.chatThreadCreate = async (req, res) => {
  const {
    proposal_id,
    host_id,
    sponsor_id,
    last_message,
    last_message_at,
    last_message_by,
  } = req.body;

  const insertQuery = `
    INSERT INTO chat_threads 
    (proposal_id, host_id, sponsor_id, last_message, last_message_at, last_message_by, created_at) 
    VALUES (?, ?, ?, ?, ?, ?, NOW())
  `;

  db.query(
    insertQuery,
    [
      proposal_id,
      host_id,
      sponsor_id,
      last_message,
      last_message_at,
      last_message_by,
    ],
    (insertErr, insertResult) => {
      if (insertErr) {
        return res.status(500).json({
          message: "Insert failed",
          error: insertErr,
        });
      }

      const insertedId = insertResult.insertId;

      const selectQuery = `SELECT * FROM chat_threads WHERE id = ?`;
      db.query(selectQuery, [insertedId], (selectErr, rows) => {
        if (selectErr) {
          return res.status(500).json({
            message: "Fetch after insert failed",
            error: selectErr,
          });
        }

        return res.status(201).json({
          message: "New chat thread created",
          result: rows[0],
        });
      });
    }
  );
};
exports.ChatMessagefilter = async (req, res) => {
  var data = req.body;

  const query = `SELECT * FROM chat_messages WHERE thread_id =? order by id desc`;

  db.query(query, [data.thread_id], (err, results) => {
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
exports.getUnreadMessages = async (req, res) => {
  const { thread_id, user_id } = req.body;

  if (!thread_id || !user_id) {
    return res.status(400).json({
      status: 0,
      message: "thread_id and user_id are required",
    });
  }

  const query = `
    SELECT * FROM chat_messages
    WHERE thread_id = ? AND sender_id != ?
  `;

  db.query(query, [thread_id, user_id], (err, results) => {
    if (err) {
      return res.status(500).json({
        status: 0,
        message: "Database query error",
        error: err,
      });
    }

    return res.status(200).json({
      status: 1,
      message: "Unread messages fetched",
      results: results,
    });
  });
};
exports.updateMessage = (req, res) => {
  const { messageid, updateData } = req.body;
  console.log(req.body);
  if (!messageid || !updateData || typeof updateData !== "object") {
    return res.status(400).json({
      status: "error",
      message: "Missing or invalid data",
    });
  }

  const fields = Object.keys(updateData);
  const values = Object.values(updateData);

  const setClause = fields.map((field) => `${field} = ?`).join(", ");
  const sql = `UPDATE chat_messages SET ${setClause} WHERE id = ?`;

  // Append messageid at the end for WHERE clause
  db.query(sql, [...values, messageid], (err, result) => {
    if (err) {
      console.error("DB update error:", err);
      return res.status(500).json({
        status: "error",
        message: "Failed to update message",
        error: err.message,
      });
    }

    return res.status(200).json({
      status: "success",
      message: "Message updated successfully",
    });
  });
};
exports.updateThread = (req, res) => {
  const { threadId, updateData } = req.body;

  if (!threadId || !updateData || typeof updateData !== "object") {
    return res.status(400).json({
      status: "error",
      message: "Missing or invalid data",
    });
  }

  const fields = Object.keys(updateData);
  const values = Object.values(updateData);

  // e.g., "last_message = ?, last_message_by = ?"
  const setClause = fields.map((field) => `${field} = ?`).join(", ");
  const sql = `UPDATE chat_threads SET ${setClause} WHERE id = ?`;

  db.query(sql, [...values, threadId], (err, result) => {
    if (err) {
      console.error("DB update error:", err);
      return res.status(500).json({
        status: "error",
        message: "Failed to update chat thread",
        error: err.message,
      });
    }

    return res.status(200).json({
      status: "success",
      message: "Chat thread updated successfully",
    });
  });
};
exports.createChatMessage = (req, res) => {
  const {
    thread_id,
    sender_id,
    message,
    message_type = "text",
    read_by_host = false,
    read_by_sponsor = false,
  } = req.body;

  if (!thread_id || !sender_id || !message) {
    return res.status(400).json({
      status: "error",
      message: "Missing required fields",
    });
  }

  const insertSql = `
    INSERT INTO chat_messages 
    (thread_id, sender_id, message, message_type, read_by_host, read_by_sponsor, read_at, created_date) 
    VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
  `;

  const insertValues = [
    thread_id,
    sender_id,
    message,
    message_type,
    read_by_host ? 1 : 0,
    read_by_sponsor ? 1 : 0,
  ];

  db.query(insertSql, insertValues, (err, result) => {
    if (err) {
      console.error("Insert message error:", err);
      return res.status(500).json({
        status: "error",
        message: "Failed to create chat message",
        error: err.message,
      });
    }

    const insertedId = result.insertId;

    const selectSql = `SELECT * FROM chat_messages WHERE id = ?`;

    db.query(selectSql, [insertedId], (selectErr, selectResult) => {
      if (selectErr) {
        console.error("Fetch message error:", selectErr);
        return res.status(500).json({
          status: "error",
          message: "Message inserted but failed to fetch",
          error: selectErr.message,
        });
      }

      const newMessage = selectResult[0];

      // Update thread with new message and timestamp
      const updateThreadSql = `
        UPDATE chat_threads 
        SET last_message = ?, last_message_at = NOW(), last_message_by = ?,
            host_unread_count = CASE 
              WHEN ? != host_id THEN host_unread_count + 1 
              ELSE host_unread_count 
            END,
            sponsor_unread_count = CASE 
              WHEN ? != sponsor_id THEN sponsor_unread_count + 1 
              ELSE sponsor_unread_count 
            END
        WHERE id = ?
      `;

      db.query(
        updateThreadSql,
        [message, sender_id, sender_id, sender_id, thread_id],
        (updateErr, updateResult) => {
          if (updateErr) {
            console.error("Update thread error:", updateErr);
            return res.status(500).json({
              status: "error",
              message: "Message created but thread update failed",
            });
          }

          // Get the updated thread with user details
          const getThreadSql = `
          SELECT ct.*, 
                 u1.full_name as host_name, u1.profile_image as host_image,
                 u2.full_name as sponsor_name, u2.profile_image as sponsor_image,
                 sp.title as proposal_title
          FROM chat_threads ct
          LEFT JOIN register u1 ON ct.host_id = u1.id
          LEFT JOIN register u2 ON ct.sponsor_id = u2.id
          LEFT JOIN sponsorshipproposal_export sp ON ct.proposal_id = sp.id
          WHERE ct.id = ?
        `;

          db.query(getThreadSql, [thread_id], (threadErr, threadResults) => {
            if (threadErr) {
              console.error("Get thread error:", threadErr);
              return res.status(500).json({
                status: "error",
                message: "Message created but failed to get thread details",
              });
            }

            const updatedThread = threadResults[0];
            const io = req.app.get("io");

            // Determine receiver ID and sender name
            const receiverId =
              sender_id === updatedThread.host_id
                ? updatedThread.sponsor_id
                : updatedThread.host_id;
            const senderName =
              sender_id === updatedThread.host_id
                ? updatedThread.host_name
                : updatedThread.sponsor_name;

            // Create notification object
            const notification = {
              id: Date.now(), // temporary ID
              type: "message",
              title: "New Message",
              message: `New message from ${senderName}: ${message.substring(0, 50)}${message.length > 50 ? "..." : ""}`,
              senderName: senderName,
              threadId: thread_id,
              timestamp: new Date().toISOString(),
              read: false,
            };

            // Send notification to receiver
            io.to(`user_${receiverId}`).emit(
              "new_message_notification",
              notification
            );

            // Prepare enriched thread data for real-time update
            const enrichedThread = {
              id: updatedThread.id,
              host_id: updatedThread.host_id,
              sponsor_id: updatedThread.sponsor_id,
              proposal_id: updatedThread.proposal_id,
              last_message: updatedThread.last_message,
              last_message_at: updatedThread.last_message_at,
              last_message_by: updatedThread.last_message_by,
              host_unread_count: updatedThread.host_unread_count,
              sponsor_unread_count: updatedThread.sponsor_unread_count,
              created_at: updatedThread.created_at,
              // Add other user details
              otherUser: {
                full_name:
                  sender_id === updatedThread.host_id
                    ? updatedThread.sponsor_name
                    : updatedThread.host_name,
                profile_image:
                  sender_id === updatedThread.host_id
                    ? updatedThread.sponsor_image
                    : updatedThread.host_image,
              },
              proposal: {
                title: updatedThread.proposal_title,
              },
              unreadCount:
                sender_id === updatedThread.host_id
                  ? updatedThread.sponsor_unread_count
                  : updatedThread.host_unread_count,
            };

            // Emit new message to thread room (for chat modal)
            io.to(`thread_${thread_id}`).emit("new_message", newMessage);

            // Emit thread update to both users for real-time inbox update
            io.to(`user_${updatedThread.host_id}`).emit(
              "thread_updated",
              enrichedThread
            );
            io.to(`user_${updatedThread.sponsor_id}`).emit(
              "thread_updated",
              enrichedThread
            );

            return res.status(201).json({
              status: "success",
              message: "Chat message created",
              results: newMessage,
            });
          });
        }
      );
    });
  });
};

// Node.js Express API
exports.updateChatThread = (req, res) => {
  const { threadId, updateData } = req.body;
  console.log("Request Body:", req.body);

  if (!threadId || !updateData || typeof updateData !== "object") {
    return res.status(400).json({
      status: "error",
      message: "Missing or invalid data",
    });
  }

  const fields = Object.keys(updateData);
  const values = Object.values(updateData);

  // Build dynamic SET clause: e.g., "last_message = ?, host_unread_count = ?"
  const setClause = fields.map((field) => `${field} = ?`).join(", ");
  const sql = `UPDATE chat_threads SET ${setClause} WHERE id = ?`;

  // Use db.query with a callback instead of await
  db.query(sql, [...values, threadId], (err, result) => {
    if (err) {
      console.error("DB update error:", err);
      return res.status(500).json({
        status: "error",
        message: "Update failed",
        error: err.message,
      });
    }

    return res.status(200).json({
      status: "success",
      message: "Thread updated successfully",
    });
  });
};
// GET user threads based on user ID (host or sponsor)
exports.getUserThreads = (req, res) => {
  const userId = req.body.userId;
  console.log(userId);
  if (!userId) {
    return res.status(400).json({
      status: "error",
      message: "Missing userId in query parameters",
    });
  }

  const sql = `
    SELECT * FROM chat_threads
    WHERE host_id = ? OR sponsor_id = ?
    ORDER BY last_message_at DESC
    LIMIT 50
  `;

  db.query(sql, [userId, userId], (err, results) => {
    if (err) {
      console.error("Error fetching user threads:", err);
      return res.status(500).json({
        status: "error",
        message: "Database query failed",
        error: err.message,
      });
    }

    return res.status(200).json({
      status: "success",
      threads: results,
    });
  });
};
exports.getUserThreadsCheck = (req, res) => {
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({
      status: "error",
      message: "Missing userId in request body",
    });
  }

  // ✅ Removed unnecessary join (it caused duplicates)
  const sql = `
    SELECT *
    FROM chat_threads
    WHERE host_id = ? OR sponsor_id = ?
    ORDER BY last_message_at DESC
    LIMIT 50
  `;

  db.query(sql, [userId, userId], (err, results) => {
    if (err) {
      console.error("Error fetching user threads:", err);
      return res.status(500).json({
        status: "error",
        message: "Database query failed",
        error: err.message,
      });
    }

    console.log(`Found ${results.length} threads for user ${userId}`);

    results.forEach((thread) => {
      console.log(
        `Thread ${thread.id}: host_unread_count=${thread.host_unread_count}, sponsor_unread_count=${thread.sponsor_unread_count}, user=${userId}, host=${thread.host_id}, sponsor=${thread.sponsor_id}`
      );
    });

    return res.status(200).json({
      status: "success",
      threads: results,
    });
  });
};

exports.userfilter = (req, res) => {
  const userId = req.body.id;
  if (!userId) {
    return res.status(400).json({
      status: "error",
      message: "Missing userId in query parameters",
    });
  }

  const sql = `
    SELECT * FROM register
    WHERE id = ? 
  `;

  db.query(sql, [userId], (err, row) => {
    if (err) {
      console.error("Error fetching user threads:", err);
      return res.status(500).json({
        status: "error",
        message: "Database query failed",
        error: err.message,
      });
    }

    return res.status(200).json({
      status: "success",
      results: row,
    });
  });
};

exports.sponsorfilter = (req, res) => {
  const userId = req.body.id;

  if (!userId) {
    return res.status(400).json({
      status: "error",
      message: "Missing id in query parameters",
    });
  }

  const sql = `
    SELECT * FROM sponsorshipproposal_export
    WHERE id = ? 
  `;

  db.query(sql, [userId], (err, row) => {
    if (err) {
      console.error("Error fetching user threads:", err);
      return res.status(500).json({
        status: "error",
        message: "Database query failed",
        error: err.message,
      });
    }

    return res.status(200).json({
      status: "success",
      results: row[0],
    });
  });
};

exports.createstripe = async (req, res) => {
  try {
    const { stripeemail, userId } = req.body;

    if (!stripeemail || !userId) {
      return res
        .status(400)
        .json({ error: "Stripe email and userId are required" });
    }

    // 1. Create Stripe account
    const account = await stripe.accounts.create({
      type: "express",
      country: "US",
      email: stripeemail,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
    });

    // 2. Save Stripe account ID into register table
    const updateQuery = `UPDATE register SET stripe_account_id = ? WHERE id = ?`;

    db.query(updateQuery, [account.id, userId], async (err, result) => {
      if (err) {
        console.error("DB update error:", err);
        return res.status(500).json({ error: "Database update failed" });
      }

      // 3. Create onboarding link
      const accountLink = await stripe.accountLinks.create({
        account: account.id,
        refresh_url: "https://communitysponsor.org/backend/payoutsettings",
        return_url: "https://communitysponsor.org/backend/payoutsettings",
        type: "account_onboarding",
      });

      // 4. Send onboarding link back
      res.json({ accountLink: accountLink.url });
    });
  } catch (error) {
    console.error("Stripe error:", error);
    res.status(500).json({ error: error.message });
  }
};
exports.getAll = async (req, res) => {
  var userId = req.body.userId;

  const query = `SELECT * FROM allnotifications  
        WHERE user_id = ? 
        ORDER BY created_at DESC
        LIMIT 50`;

  db.query(query, [userId], (err, notifications) => {
    if (err) {
      return res.status(500).json({
        message: "Database query error",
        error: err,
      });
    }
    res.json({ success: true, notifications });
  });
};

exports.getAllUnreadCount = async (req, res) => {
  var userId = req.body.userId;

  const query = `SELECT COUNT(*) as count FROM allnotifications  
        WHERE user_id = ? AND is_read = FALSE`;

  db.query(query, [userId], (err, result) => {
    if (err) {
      return res.status(500).json({
        message: "Database query error",
        error: err,
      });
    }
    res.json({ success: true, totalUnread: result[0].count });
  });
};

exports.markAsReadAll = async (req, res) => {
  var userId = req.body.userId;

  const query = `UPDATE allnotifications SET is_read = TRUE 
        WHERE user_id = ? AND is_read = FALSE`;

  db.query(query, [userId], (err, result) => {
    if (err) {
      return res.status(500).json({
        message: "Database query error",
        error: err,
      });
    }

    // Updated count return karo
    const countQuery = `SELECT COUNT(*) as unreadCount FROM allnotifications WHERE user_id = ? AND is_read = FALSE`;

    db.query(countQuery, [userId], (countErr, countResult) => {
      if (countErr) {
        return res.status(500).json({
          message: "Count query error",
          error: countErr,
        });
      }

      res.json({
        success: true,
        unreadCount: countResult[0].unreadCount,
      });
    });
  });
};

exports.getUserrecords = async (req, res) => {
  var userId = req.body.id;
  console.log(req.body);
  const query = `SELECT * FROM register WHERE id = ?`;

  db.query(query, [userId], (err, row) => {
    if (err) {
      return res.status(500).json({
        message: "Database query error",
        error: err,
      });
    }
    res.json({ success: true, result: row });
  });
};
