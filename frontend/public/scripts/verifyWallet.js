// Check if the current page is the verify page with tgId in the URL
if (window.location.pathname === "/verify" && new URLSearchParams(window.location.search).has("tgId")) {
    console.log(window.Buffer)
    console.log("🔹 Starting wallet verification...");
    console.log("✅ Verification page detected");
    console.log("solanaWeb3:", window.solanaWeb3);
    async function verifyWallet() {
        console.log(window.Buffer)
        console.log("🔹 Starting wallet verification...");
        console.log("✅ Verification page detected");
        console.log("solanaWeb3:", window.solanaWeb3);
        const params = new URLSearchParams(window.location.search);
        const tgId = params.get("tgId");

        if (!tgId) {
            console.error("❌ Missing Telegram ID!");
            alert("Missing Telegram ID!");
            return;
        }

        // **Check if the wallet is already verified**
        const validationResponse = await fetch(`/api/check-tgid?tgId=${tgId}`);
        const validationData = await validationResponse.json();

        if (validationData.success) {
            // Calculate remaining validity days
            const lastUpdated = new Date(validationData.last_updated);
            const now = new Date();
            const daysSinceUpdate = Math.floor((now - lastUpdated) / (1000 * 60 * 60 * 24));
            const daysLeft = 30 - daysSinceUpdate;

            if (daysLeft > 0) {
                console.log(`✅ Wallet is already verified! (${daysLeft} days remaining)`);
                document.getElementById("status").textContent = `TG User ${tgId} is already validated! (${daysLeft} days remaining)`;

                return;
            }
        }

        try {
            const provider = window.solana; // Phantom or Backpack
            if (!provider) {
                throw new Error("Solana provider not found. Make sure Phantom is installed.");
            }

            console.log("🔹 Connecting to wallet...");
            await provider.connect();
            console.log("✅ Wallet connected!");

            const walletAddress = provider.publicKey.toString();
            console.log("🔹 Wallet Address:", walletAddress);

            // Sign the message to verify ownership
            const message = `Sign this message to verify ownership of this wallet for Telegram ID: ${tgId}`;
            const encodedMessage = new TextEncoder().encode(message);
            const signedMessage = await provider.signMessage(encodedMessage, "utf8");
            console.log("✅ Message signed successfully:", signedMessage);

            // Payment parameters
            const receivingWalletAddress = new window.solanaWeb3.PublicKey("5twk4qwDCU4dcUzHQSXyL86qv97UVbvCTEWYyW8Vo6QK");
            const paymentAmount = 0.0001;
            console.log(`🔹 Sending ${paymentAmount} SOL to ${receivingWalletAddress}`);

            // Check values before creating the transaction
            console.log("🔹 Provider PublicKey:", provider.publicKey);
            console.log("🔹 Receiving Wallet Address:", receivingWalletAddress);
            console.log("🔹 LAMPORTS_PER_SOL:", window.solanaWeb3.LAMPORTS_PER_SOL);
            console.log("🔹 Payment Amount in Lamports:", window.solanaWeb3.LAMPORTS_PER_SOL * paymentAmount);


            // Get the recent blockhash from the Solana network
            const connection = new window.solanaWeb3.Connection("https://docs-demo.solana-mainnet.quiknode.pro/");
            const blockhash  = await connection.getLatestBlockhash();
            // Create a transaction with the recentBlockhash and feePayer
            const transaction = new window.solanaWeb3.Transaction({
                recentBlockhash: blockhash.blockhash, // Add the recent blockhash here
                feePayer: provider.publicKey, // Set the fee payer (the wallet sending the transaction)
            }).add(
                window.solanaWeb3.SystemProgram.transfer({
                    fromPubkey: provider.publicKey,
                    toPubkey: receivingWalletAddress,
                    lamports: window.solanaWeb3.LAMPORTS_PER_SOL * paymentAmount, // Convert SOL to lamports
                })
            );

            console.log("🔹 Constructed transaction:", transaction);

            // Sign and send the transaction
            console.log("🔹 Sending transaction...");
            const signature = await provider.signAndSendTransaction(transaction);
            // console.log("✅ Transaction sent! Signature:", signature);

            // Wait for confirmation
            console.log(signature)
            console.log("🔹 Waiting for transaction confirmation...");

            const confirmation = await connection.confirmTransaction(
                {
                    signature:signature.signature,
                    blockhash: blockhash.blockhash,
                    lastValidBlockHeight: blockhash.lastValidBlockHeight
                },
                "confirmed" // Commitment level (options: "processed", "confirmed", "finalized")
            );
            console.log("✅ Transaction confirmation response:", confirmation);

            if (confirmation.value.err === null) {
                console.log("✅ Payment successful! Proceeding with backend verification...");

                // Send verification request to backend
                const res = await fetch("/api/verify-wallet", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ tgId, walletAddress, signedMessage }),
                });

                const result = await res.json();
                console.log("🔹 Backend response:", result);

                if (result.success) {
                    console.log("✅ Wallet linked successfully!");
                    alert("✅ Wallet linked successfully and payment verified!");
                } else {
                    console.error("❌ Backend verification failed:", result);
                    alert("❌ Verification failed.");
                }
            } else {
                console.error("❌ Transaction failed, not posting to backend.");
                alert("❌ Transaction failed. Please try again.");
            }
        } catch (error) {
            console.error("❌ Error verifying wallet:", error);
            alert(`❌ Error: ${error.message}`);
        }
    }

    // // Start the wallet verification process
    verifyWallet();
} else {
    console.log("This is not the correct verification page.");
}
