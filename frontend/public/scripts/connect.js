document.getElementById("connectWallet").addEventListener("click", async () => {
    if (!window.solana || !window.solana.isPhantom) {
        alert("Phantom wallet is not installed!");
        return;
    }

    try {
        // Connect to Phantom Wallet
        const response = await window.solana.connect();
        const publicKey = response.publicKey.toString();

        // Generate a message to be signed (e.g., a nonce or a custom message)
        const message = "Please sign this message to confirm your public key in order to use it for the Mandog Chrome extension";

        // Request the user to sign the message
        const signedMessage = await window.solana.signMessage(new TextEncoder().encode(message), "utf8");

        // Check validation status from backend
        const validationResponse = await fetch(`/api/check-wallet?walletPublicKey=${publicKey}`);
        const validationData = await validationResponse.json();


        // If the user successfully signs the message, proceed to confirm and send the public key
        if (signedMessage.signature) {
            if (validationData.success) {
                // Calculate remaining validity days
                const lastUpdated = new Date(validationData.last_updated);
                const now = new Date();
                const daysSinceUpdate = Math.floor((now - lastUpdated) / (1000 * 60 * 60 * 24));
                const daysLeft = 30 - daysSinceUpdate;
    
                if (daysLeft > 0) {
                    // Send public key to the extension via window.postMessage
                    window.postMessage({ type: "SET_WALLET_PUBLIC_KEY", publicKey: publicKey }, "*");
                    console.log(`Sent message to window with pubkey ${publicKey}`);
                    document.getElementById("status").textContent = `Connected and signed: ${publicKey}\nWallet is validated! (${daysLeft} days remaining)`;
                    return; // No need to sign again
                }
            }else{
                document.getElementById("status").innerHTML = `⛔ ${publicKey} not validated or verification expired. Verify via our official Telegram bot <a href="https://t.me/ManDogMFbot" target="_blank" rel="noopener noreferrer">@ManDogMFbot</a>`;
            }
        }
    } catch (error) {
        console.error("Error connecting or signing message:", error);
        document.getElementById("status").textContent = "Failed to connect or sign the message. Please try again.";
    }
});