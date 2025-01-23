const express = require('express');
const path = require("path")
const http = require('http');

require('dotenv').config();

const heliosRoutes = require('./routes/heliusRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json()); // Für das Verarbeiten von JSON-Daten
app.use(express.urlencoded({ extended: true })); // Für das Verarbeiten von URL-codierten Daten
app.use(express.static(path.join(__dirname, 'frontend/public')));

app.use("/api/helius", heliosRoutes); // Use the chat route under /api



app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend','public', 'index.html'));
});


app.listen(PORT, () => {
  console.log(`Server läuft auf http://localhost:${PORT}`);

});
