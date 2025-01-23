const express = require('express');
const router = express.Router();
const { getFreshness } = require("../controllers/heliusController"); // Adjust the path as needed

router.get('/getFreshness', getFreshness);

module.exports = router;