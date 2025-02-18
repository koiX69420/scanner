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

        // If the user successfully signs the message, proceed to confirm and send the public key
        if (signedMessage.signature) {
            // Update the status with the connected public key
            document.getElementById("status").textContent = `Connected and signed: ${publicKey}`;

            // Send public key to the extension via window.postMessage
            window.postMessage({ type: "SET_WALLET_PUBLIC_KEY", publicKey: publicKey }, "*");
            console.log(`Sent message to window with pubkey ${publicKey}`);
        }
    } catch (error) {
        console.error("Error connecting or signing message:", error);
        document.getElementById("status").textContent = "Failed to connect or sign the message. Please try again.";
    }
});