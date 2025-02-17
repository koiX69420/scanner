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

            // Connect to the wallet once
            await provider.connect();
            const walletAddress = provider.publicKey.toString();
            
            // Sign the message to verify ownership
            const message = `Sign this message to verify ownership of this wallet for Telegram ID: ${tgId}`;
            const encodedMessage = new TextEncoder().encode(message);
            const signedMessage = await provider.signMessage(encodedMessage, "utf8");
            console.log(signedMessage);
            
            // Payment parameters
            const receivingWalletAddress = "5twk4qwDCU4dcUzHQSXyL86qv97UVbvCTEWYyW8Vo6QK";  // The wallet address where the payment should go
            const paymentAmount = 0.001;  // Payment amount in SOL (for example)

            // Prompt user to make payment
            const paymentMessage = `To complete the verification, please send ${paymentAmount} SOL to the following address: ${receivingWalletAddress}`;

            // Create a transaction to send SOL to the receiving wallet address
            const transaction = new window.solana.Transaction().add(
                window.solana.SystemProgram.transfer({
                    fromPubkey: provider.publicKey,
                    toPubkey: new window.solana.PublicKey(receivingWalletAddress),
                    lamports: window.solana.LAMPORTS_PER_SOL * paymentAmount, // Convert SOL to lamports
                })
            );

            // Sign and send the transaction
            const signature = await provider.signAndSendTransaction(transaction);

            // Wait for the transaction to be confirmed
            const confirmation = await provider.connection.confirmTransaction(signature);

            // If confirmation is successful, proceed
            if (confirmation.value.err === null) {
                // Once payment is confirmed, send the signed message to the backend for verification
                const res = await fetch("/api/verify-wallet", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ tgId, walletAddress, signedMessage }),
                });

                const result = await res.json();
                if (result.success) {
                    alert("✅ Wallet linked successfully and payment verified!");
                } else {
                    alert("❌ Verification failed");
                }
            } else {
                alert("❌ Payment failed. Please try again.");
            }
        } catch (error) {
            console.error("Error verifying wallet:", error);
            alert("❌ Something went wrong during the verification process.");
        }
    }

    // Start the wallet verification process
    verifyWallet();
} else {
    console.log("This is not the correct verification page.");
}
