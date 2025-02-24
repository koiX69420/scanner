const express = require('express');
const path = require("path");

const router = express.Router();

router.get('/privacy', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/public/privacy.html'));
});

router.get("/verify", (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/public/verify.html'));
});

router.get("/deviceupdate", (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/public/deviceupdate.html'));
});

router.get("/stats", (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/public/stats.html'));
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

router.get("/get-sub-wallet", async (req, res) => {
  if (!process.env.SUB_WALLET) {
      return res.status(500).json({ error: "SUB WALLET is missing" });
  }
  
  res.json({
      subWallet: `${process.env.SUB_WALLET}`,
  });
});

router.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/public/index.html'));
});

module.exports = router;