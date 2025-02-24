const express = require('express');
const path = require("path")
const http = require('http');
const nacl = require("tweetnacl")
const { PublicKey } = require('@solana/web3.js'); // Import the PublicKey class from Solana Web3.js
const pool = require("./db/db"); // PostgreSQL connection
const cors = require("cors");

require('dotenv').config();


const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json()); // Für das Verarbeiten von JSON-Daten
app.use(express.urlencoded({ extended: true })); // Für das Verarbeiten von URL-codierten Daten
app.use(cors()); // Security and cross-origin requests
app.use(express.static(path.join(__dirname, 'frontend/public')));
app.use(express.static("dist"));

// Routes
const authRoutes = require('./routes/authRoutes');
const tokenRoutes = require('./routes/messageRoutes');
const staticRoutes = require('./routes/staticRoutes');
const validationRoutes = require('./routes/validationRoutes');
const statsRoutes = require('./routes/statsRoutes');

// Use route modules
app.use('/api', tokenRoutes);
app.use('/api', authRoutes);
app.use('/api', validationRoutes);
app.use('/api', statsRoutes);
app.use('/', staticRoutes);


app.listen(PORT, () => {
  console.log(`Server läuft auf http://localhost:${PORT}`);

});
