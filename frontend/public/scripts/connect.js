document.getElementById("connectWallet").addEventListener("click", connectWallet);

async function connectWallet() {
    if (!isPhantomInstalled()) {
        alert("Phantom wallet is not installed!");
        return;
    }

    try {
        const publicKey = await getPublicKey();
        if (!publicKey) return;

        const signedMessage = await signMessage();
        if (!signedMessage) return;

        const validationData = await checkWalletValidation(publicKey);

        if (validationData.success) {
            handleValidatedWallet(publicKey, validationData);
        } else {
            handleUnvalidatedWallet(publicKey);
        }
    } catch (error) {
        console.error("❌ Error connecting or signing message:", error);
        updateStatus("⚠️ Failed to connect or sign the message. Please try again.");
    }
}

// ✅ Check if Phantom Wallet is installed
function isPhantomInstalled() {
    return window.solana && window.solana.isPhantom;
}

// ✅ Connect & get the user's public key
async function getPublicKey() {
    try {
        const response = await window.solana.connect();
        return response.publicKey.toString();
    } catch (error) {
        console.error("❌ Error connecting to Phantom:", error);
        updateStatus("⚠️ Failed to connect to Phantom.");
        return null;
    }
}

// ✅ Sign a message with the wallet
async function signMessage() {
    const message = "Please sign this message to confirm your public key for the Mandog Chrome extension";
    
    try {
        return await window.solana.signMessage(new TextEncoder().encode(message), "utf8");
    } catch (error) {
        console.error("❌ Error signing message:", error);
        updateStatus("⚠️ Signature request was declined.");
        return null;
    }
}

// ✅ Check wallet validation via backend API
async function checkWalletValidation(publicKey) {
    try {
        const response = await fetch(`/api/check-wallet?walletPublicKey=${publicKey}`);
        return await response.json();
    } catch (error) {
        console.error("❌ Error checking wallet validation:", error);
        return { success: false };
    }
}

// ✅ Handle a validated wallet
function handleValidatedWallet(publicKey, validationData) {
    const daysLeft = getDaysLeft(validationData.valid_until);

    if (daysLeft > 0) {
        window.postMessage({ type: "SET_WALLET_PUBLIC_KEY", publicKey:publicKey }, "*");
        updateStatus(`✅ Your wallet is now injected to the MDTT browser extention.<br>Wallet <b>${publicKey}</b> verified!<br> (${daysLeft} days remaining)`);
    } else {
        updateStatus(`⚠️ Wallet validation expired.`);
    }
}

// ✅ Handle an unvalidated wallet
function handleUnvalidatedWallet(publicKey) {
    window.postMessage({ type: "SET_WALLET_PUBLIC_KEY", publicKey:publicKey }, "*");
    updateStatus(`✅ Your wallet is now injected to the MDTT browser extention.<br>⛔ BUT ${publicKey} is not verified with an active subscription. You may only use the extention with over [TBA] Mandog Tokens in your wallet`);
}

// ✅ Calculate remaining validation days
function getDaysLeft(validUntil) {
    const validUntilDate = new Date(validUntil);
    const now = new Date();
    return Math.max(Math.floor((validUntilDate - now) / (1000 * 60 * 60 * 24)), 0); // Ensure non-negative days
}

// ✅ Update status message
function updateStatus(message) {
    document.getElementById("status").innerHTML = message;
}
