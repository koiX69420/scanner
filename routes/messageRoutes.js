const express = require('express');
const { generateTokenMessage } = require('../bot/scanner');
const pool = require('../db/db');
const { fetchTokenAccounts } = require("../bot/solscanApi")
const router = express.Router();

TOKEN_ADDRESS = process.env.TOKEN_ADDRESS
TOKENGATE_AMOUNT = process.env.TOKENGATE_AMOUNT
async function tokenGate(walletAddress) {
    // Fetch token accounts for the wallet
    const tokenAccounts = await fetchTokenAccounts(walletAddress);
    
    // Find the specific token account using the token address
    const tokenAccount = tokenAccounts.find(({ token_address }) => token_address === TOKEN_ADDRESS);
    
    // If no token account found, return false early
    if (!tokenAccount) return false;
    
    // Destructure the necessary fields from the token account
    const { amount, token_decimals } = tokenAccount;
    
    // Convert the raw amount to human-readable amount
    const fetchedAmount = amount / (10 ** token_decimals);
    // Return whether the fetched amount is greater than or equal to the required amount
    return fetchedAmount >= parseInt(TOKENGATE_AMOUNT);
  }

router.post("/token-message", async (req, res) => {
    const { tokenAddress, walletAddress, isSummary = false, hardwareConcurrency, deviceMemory, language, userAgent } = req.body;

    if (!walletAddress) {
        return res.status(400).json({ success: false, error: "❌ Missing wallet public key" });
    }
    const hasMoreTokensThanNeeded = await tokenGate(walletAddress);
    if (hasMoreTokensThanNeeded) {
        try {
            // If all checks pass, generate the token message
            const response = await generateTokenMessage(tokenAddress, isSummary);

            return res.status(200).json({
                success: true,
                response
            });
        } catch (error) {
            console.error("❌ Error validating wallet:", error);
            res.status(500).json({ success: false, error: "🚨 Internal server error." });
        }

    } else {
        try {
            // Query to check if wallet is validated and device data matches
            const validationQuery = `
              SELECT * FROM validated_users
              WHERE wallet_address = $1
          `;

            const { rows } = await pool.query(validationQuery, [walletAddress]);

            // If no row is returned, it means the wallet is not validated
            if (rows.length === 0) {
                return res.status(403).json({
                    success: false,
                    error: `⛔ Wallet not validated. Please complete the verification process via <a href="https://t.me/ManDogMFbot?start=verify" target="_blank" rel="noopener noreferrer">@ManDogMFbot</a>`
                });
            }

            const user = rows[0];

            // Check if validation has expired
            if (new Date(user.valid_until) < new Date()) {
                return res.status(403).json({
                    success: false,
                    error: `⛔ Validation expired. Please renew your validation via <a href="https://t.me/ManDogMFbot?start=verify" target="_blank" rel="noopener noreferrer">@ManDogMFbot</a>`
                });
            }

            // Check if device data matches
            if (
                user.hardware_concurrency !== hardwareConcurrency ||
                user.device_memory !== deviceMemory ||
                user.language !== language ||
                user.user_agent !== userAgent
            ) {
                return res.status(403).json({
                    success: false,
                    error: `⛔ Device mismatch detected. Please update your device information via <a href="https://t.me/scannerdevtemp_bot?start=deviceupdate" target="_blank" rel="noopener noreferrer">@ManDogMFbot</a>`
                });
            }

            // If all checks pass, generate the token message
            const response = await generateTokenMessage(tokenAddress, isSummary);
            return res.status(200).json({
                success: true,
                response
            });
        } catch (error) {
            console.error("❌ Error validating wallet:", error);
            res.status(500).json({ success: false, error: "🚨 Internal server error." });
        }
    }


});

module.exports = router;
