const mysql = require("mysql2");

// Create a connection pool
const db = mysql.createPool({
  connectionLimit: 10000, // Limits the number of simultaneous connections
  host: "localhost",
  user: "root",
  password: "",
  database: "communitysponser",
  port: 3306,
  debug: false,
});

// Handle connection and errors
db.getConnection((err, connection) => {
  if (err) {
    if (err.code === "PROTOCOL_CONNECTION_LOST") {
      console.error("Database connection was closed.");
    }
    if (err.code === "ER_CON_COUNT_ERROR") {
      console.error("Database has too many connections.");
    }
    if (err.code === "ECONNREFUSED") {
      console.error("Database connection was refused.");
    }
  }
  if (connection) connection.release(); // Release the connection back to the pool

  return;
});

// Export the pool for use in other modules
module.exports = db;
