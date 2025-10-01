// firebase.js
const admin = require("firebase-admin");
const serviceAccount = "";

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const firestore = admin.firestore();
module.exports = { firestore };
