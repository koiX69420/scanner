const express = require('express');
const path = require("path");

const router = express.Router();

router.get('/privacy', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/public/privacy.html'));
});

router.get("/verify", (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/public/verify.html'));
});

// Endpoint to serve the RPC URL
router.get("/get-solana-rpc", async (req, res) => {
  if (!process.env.HELIUS_URL) {
      return res.status(500).json({ error: "API key is missing" });
  }
  
  res.json({
      rpcUrl: `${process.env.HELIUS_URL}`,
  });
});

router.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/public/index.html'));
});

module.exports = router;