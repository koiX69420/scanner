const express = require('express');
const path = require("path");

const router = express.Router();

router.get('/privacy', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/public/privacy.html'));
});

router.get("/verify", (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/public/verify.html'));
});

router.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/public/index.html'));
});

module.exports = router;