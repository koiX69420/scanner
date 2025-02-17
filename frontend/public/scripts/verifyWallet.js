// Check if the current page is the verify page with tgId in the URL
if (window.location.pathname === "/verify" && new URLSearchParams(window.location.search).has("tgId")) {
    async function verifyWallet() {
        const params = new URLSearchParams(window.location.search);
        const tgId = params.get("tgId"); // Get Telegram ID from URL

        if (!tgId) {
            alert("Missing Telegram ID!");
            return;
        }

        try {
            const provider = window.solana; // Phantom or Backpack
            await provider.connect();
            const walletAddress = provider.publicKey.toString();
            
            const message = `Sign this message to verify ownership of this wallet for Telegram ID: ${tgId}`;
            const encodedMessage = new TextEncoder().encode(message);
            const signedMessage = await provider.signMessage(encodedMessage, "utf8");
            console.log(signedMessage)
            console.log("yoyooyoyoyoy")

            const res = await fetch("/api/verify-wallet", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ tgId, walletAddress, signedMessage }),
            });
            console.log(res)
            alert("✅ Wallet linked successfully!");
        } catch (error) {
            console.error("Error verifying wallet:", error);
        }
    }

    verifyWallet();
} else {
    console.log("This is not the correct verification page.");
}
