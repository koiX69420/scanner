const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const cn = process.env.DATABASE_URL
const pool = new Pool({
  "connectionString":cn,
  ssl: {
    rejectUnauthorized: false
  }
});

// Verbindung testen
pool.connect((err) => {
    if (err) {
        console.error('PostgreSQL connection error:', err.stack);
    } else {
        console.log('Connected to PostgreSQL database');
    }
});

function initializeDatabase() {
    console.log('Lade und initialisiere Datenbank-Schema...');
  
    // Pfad zur SQL-Datei
    const schemaPath = path.join(__dirname, 'schema.sql');
  
    // Datei-Inhalt laden
    const schema = fs.readFileSync(schemaPath, 'utf8');
  
    return pool
      .connect()
      .then((client) => {
        return client
          .query(schema)
          .then(() => {
            console.log('Datenbank-Schema erfolgreich initialisiert.');
          })
          .catch((error) => {
            console.error('Fehler bei der Initialisierung der Datenbank:', error);
          })
          .finally(() => {
            client.release();
          });
      })
      .catch((error) => {
        console.error('Fehler beim Verbinden mit der Datenbank:', error);
      });
  }
initializeDatabase()

module.exports = pool;