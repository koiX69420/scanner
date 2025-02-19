const express = require('express');
const path = require("path")
const http = require('http');
const nacl = require("tweetnacl")
const { PublicKey } = require('@solana/web3.js'); // Import the PublicKey class from Solana Web3.js
const pool = require("./db/db"); // PostgreSQL connection

require('dotenv').config();

const {generateTokenMessage} = require('./bot/scanner');

require('./bot/solscanApi');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json()); // Für das Verarbeiten von JSON-Daten
app.use(express.urlencoded({ extended: true })); // Für das Verarbeiten von URL-codierten Daten
app.use(express.static(path.join(__dirname, 'frontend/public')));

app.post("/api/token-message", async (req, res) => {
  const { tokenAddress, walletPublicKey, isSummary = false } = req.body;

  if (!walletPublicKey) {
      return res.status(400).json({ success: false, error: "❌ Missing wallet public key" });
  }

  try {
      // Query to check if the wallet is in the validated_users table & last_updated is within 30 days
      const validationQuery = `
          SELECT * FROM validated_users
          WHERE wallet_address = $1 
          AND last_updated > NOW() - INTERVAL '30 days'
      `;

      const { rows } = await pool.query(validationQuery, [walletPublicKey]);

      if (rows.length === 0) {
          return res.status(403).json({ 
              success: false, 
              error:` ⛔ Wallet not validated or verification expired. Verify via our official Telegram bot <a href="https://t.me/ManDogMFbot" target="_blank" rel="noopener noreferrer">@ManDogMFbot</a>` 
          });
      }

      // If wallet is valid, generate the token message
      const response = await generateTokenMessage(tokenAddress, isSummary);
      res.json(response);

  } catch (error) {
      console.error("❌ Error validating wallet:", error);
      res.status(500).json({ success: false, error: "🚨 Internal server error. Please try again." });
  }
});


app.post("/api/verify-wallet", async (req, res) => {
  const { tgId, walletAddress, signedMessage } = req.body;
  console.log(tgId)
  console.log(walletAddress)
  console.log(signedMessage)
  // Reconstruct the original message
  const message = `Sign this message to verify ownership of this wallet for Telegram ID: ${tgId}`;
  const encodedMessage = new TextEncoder().encode(message);

  try {
    const publicKey = new PublicKey(walletAddress); // Use the PublicKey constructor from Solana Web3.js
    const signature = new Uint8Array(signedMessage.signature.data); // Accessing 'data' from Buffer and creating Uint8Array

    // Verify the signature using the correct method for publicKey
    const isValid = nacl.sign.detached.verify(encodedMessage, signature, publicKey.toBuffer());

    if (isValid) {
      console.log("Signature is valid");

      // UPSERT: Insert new user if they don't exist, or update the existing one
      const userUpsertQuery = `
        INSERT INTO validated_users (wallet_address, tg_id, signed_message, last_updated)
        VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
        ON CONFLICT (wallet_address) DO UPDATE
        SET tg_id = EXCLUDED.tg_id,
            signed_message = EXCLUDED.signed_message,
            last_updated = CURRENT_TIMESTAMP
        RETURNING id;  -- Return the ID of the inserted or updated user
      `;

      const values = [walletAddress, tgId, signedMessage.signature.data];

      // Execute the upsert query
      const result = await pool.query(userUpsertQuery, values);
      
      // The ID of the newly inserted user
      const userId = result.rows[0].id;

      console.log(`User inserted with ID: ${userId}`);

      return res.json({ success: true, wallet: walletAddress, userId });
    } else {
      return res.status(400).json({ success: false, error: "Invalid signature" });
    }
  } catch (error) {
    console.error("Error during signature verification:", error);
    return res.status(400).json({ success: false, error: "Error during signature verification" });
  }
});


// ✅ GET method to verify a Telegram ID (must be updated within 30 days)
app.get("/api/verify-wallet/by-tg/:tgId", async (req, res) => {
  const { tgId } = req.params;

  try {
    const query = `
      SELECT * FROM validated_users 
      WHERE tg_id = $1 
      AND last_updated >= NOW() - INTERVAL '30 days'
    `;
    const result = await pool.query(query, [tgId]);

    if (result.rows.length > 0) {
      return res.json({ success: true, tgId });
    } else {
      return res.status(404).json({ success: false, error: "Telegram ID not found or expired" });
    }
  } catch (error) {
    console.error("Error fetching Telegram ID:", error);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

app.get("/api/check-wallet", async (req, res) => {
  const { walletPublicKey } = req.query;
  if (!walletPublicKey) {
      return res.status(400).json({ success: false, error: "Missing wallet address" });
  }

  try {
      const result = await pool.query(
          `SELECT last_updated FROM validated_users WHERE wallet_address = $1`,
          [walletPublicKey]
      );

      if (result.rows.length === 0) {
          return res.json({ success: false, error: "Wallet not validated" });
      }

      const lastUpdated = new Date(result.rows[0].last_updated);
      const now = new Date();
      const daysSinceUpdate = Math.floor((now - lastUpdated) / (1000 * 60 * 60 * 24));

      return res.json({
          success: daysSinceUpdate < 30, 
          last_updated: result.rows[0].last_updated,
          daysLeft: 30 - daysSinceUpdate
      });
  } catch (error) {
      console.error("Error checking wallet validation:", error);
      return res.status(500).json({ success: false, error: "Server error" });
  }
});

app.get("/api/check-tgid", async (req, res) => {
  const { tgId } = req.query;
  if (!tgId) {
      return res.status(400).json({ success: false, error: "Missing Telegram ID" });
  }
  console.log("yoyoyoyo")

  try {
      const result = await pool.query(
          `SELECT last_updated FROM validated_users WHERE tg_id = $1`,
          [tgId]
      );

      if (result.rows.length === 0) {
          return res.json({ success: false, error: "Telegram ID not validated" });
      }

      const lastUpdated = new Date(result.rows[0].last_updated);
      const now = new Date();
      const daysSinceUpdate = Math.floor((now - lastUpdated) / (1000 * 60 * 60 * 24));

      return res.json({
          success: daysSinceUpdate < 30, 
          last_updated: result.rows[0].last_updated,
          daysLeft: 30 - daysSinceUpdate
      });
  } catch (error) {
      console.error("Error checking Telegram ID validation:", error);
      return res.status(500).json({ success: false, error: "Server error" });
  }
});


// Serve privacy policy page
app.get('/privacy', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'public', 'privacy.html'));
});

app.get("/verify", (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend','public', "verify.html"));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend','public', 'index.html'));
});

app.use(express.static("dist"));

app.listen(PORT, () => {
  console.log(`Server läuft auf http://localhost:${PORT}`);

});
