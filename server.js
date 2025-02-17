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

// API Endpoint
app.post("/api/token-message", async (req, res) => {
  const { tokenAddress, isSummary = false } = req.body;

  const response = await generateTokenMessage(tokenAddress, false);
  res.json(response);
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

// Serve privacy policy page
app.get('/privacy', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'public', 'privacy.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend','public', 'index.html'));
});

app.use(express.static("dist"));

app.listen(PORT, () => {
  console.log(`Server läuft auf http://localhost:${PORT}`);

});
