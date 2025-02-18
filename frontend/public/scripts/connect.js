document.getElementById("connectWallet").addEventListener("click", async () => {
    if (!window.solana || !window.solana.isPhantom) {
        alert("Phantom wallet is not installed!");
        return;
    }

    try {
        const response = await window.solana.connect();
        const publicKey = response.publicKey.toString();
        document.getElementById("status").textContent = `Connected: ${publicKey}`;

        // Send public key to the extension via window.postMessage
        window.postMessage({ type: "SET_WALLET_PUBLIC_KEY", publicKey: publicKey }, "*");
        console.log(`send message to window with pubkey ${publicKey}`)
    } catch (error) {
        console.error("Error connecting wallet:", error);
    }
});
