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
    const daysLeft = getDaysLeft(validationData.last_updated);

    if (daysLeft > 0) {
        window.postMessage({ type: "SET_WALLET_PUBLIC_KEY", publicKey }, "*");
        console.log(`✅ Sent public key to extension: ${publicKey}`);
        updateStatus(`✅ Connected & signed: ${publicKey}<br>Wallet validated! (${daysLeft} days remaining)`);
    }
}

// ✅ Handle an unvalidated wallet
function handleUnvalidatedWallet(publicKey) {
    updateStatus(`⛔ ${publicKey} not validated or verification expired.<br>
        Verify via our official Telegram bot <a href="https://t.me/ManDogMFbot?start=verify" target="_blank" rel="noopener noreferrer">@ManDogMFbot</a> using /verify.`);
}

// ✅ Calculate remaining validation days
function getDaysLeft(lastUpdated) {
    const lastUpdateDate = new Date(lastUpdated);
    const now = new Date();
    return Math.max(30 - Math.floor((now - lastUpdateDate) / (1000 * 60 * 60 * 24)), 0);
}

// ✅ Update status message
function updateStatus(message) {
    document.getElementById("status").innerHTML = message;
}
