const express = require('express');
const path = require("path")
const http = require('http');

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

// Serve privacy policy page
app.get('/privacy', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'public', 'privacy.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend','public', 'index.html'));
});


app.listen(PORT, () => {
  console.log(`Server läuft auf http://localhost:${PORT}`);

});
