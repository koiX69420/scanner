// Check if the current page is the verify page with tgId in the URL
if (window.location.pathname === "/verify" && new URLSearchParams(window.location.search).has("tgId")) {
    updateStatus("🔹 Starting wallet verification...")
    async function verifyWallet() {
        const params = new URLSearchParams(window.location.search);
        const tgId = params.get("tgId");

        if (!tgId) return showError("Missing Telegram ID!");

        // Check if wallet is already verified
        const validationData = await checkWalletValidation(tgId);
        if (validationData.success) {
            const daysLeft = getDaysLeft(validationData.last_updated);
            if (daysLeft > 0) {
                return showSuccess(`✅ TG User ${tgId} is already validated with the wallet: ${validationData.publicKey} (${daysLeft} days remaining)`);
            }
        }

        try {
            const provider = getSolanaProvider();
            console.log(provider)
            const walletAddress = await connectWallet(provider);
            const signedMessage = await signVerificationMessage(provider, tgId);
            updateStatus(`Owner of <b>${walletAddress}</b> confirmed.\n Proceed with payment to verify Telegram User with ID:<b>${tgId}</b>.`)
            const signature = await processPayment(provider);

            updateStatus(" Please wait, confirming payment...",true);
            const isConfirmed = await confirmTransaction(signature.signature);
            
            if (isConfirmed) {
                await sendVerificationToBackend(tgId, walletAddress, signedMessage);
            } else {
                showError("❌ Transaction failed. Please try again.");
            }
        } catch (error) {
            showError(`❌ Error: ${error.message}`);
        }
    }

    verifyWallet();
} else {
    console.log("This is not the correct verification page.");
}

// ✅ Helper Functions

async function checkWalletValidation(tgId) {
    try {
        const response = await fetch(`/api/check-tgid?tgId=${tgId}`);
        return await response.json();
    } catch (error) {
        console.error("❌ Error checking validation:", error);
        return { success: false };
    }
}

function getDaysLeft(lastUpdated) {
    const lastUpdateDate = new Date(lastUpdated);
    const now = new Date();
    return Math.max(30 - Math.floor((now - lastUpdateDate) / (1000 * 60 * 60 * 24)), 0);
}

function getSolanaProvider() {
    const provider = window.solana;
    if (!provider) throw new Error("Solana provider not found. Make sure Phantom is installed.");
    return provider;
}

async function connectWallet(provider) {
    console.log("🔹 Connecting to wallet...");
    await provider.connect();
    console.log("✅ Wallet connected!");
    return provider.publicKey.toString();
}

async function signVerificationMessage(provider, tgId) {
    const message = `Sign this message to verify ownership of this wallet for Telegram ID: ${tgId}`;
    const encodedMessage = new TextEncoder().encode(message);
    return await provider.signMessage(encodedMessage, "utf8");
}

async function getRPCUrl() {
    const response = await fetch("/get-solana-rpc");
    const data = await response.json();
    return data.rpcUrl;
}

async function processPayment(provider) {
    const rpcUrl = await getRPCUrl();

    const connection = new window.solanaWeb3.Connection(rpcUrl);
    const receivingWallet = new window.solanaWeb3.PublicKey("5twk4qwDCU4dcUzHQSXyL86qv97UVbvCTEWYyW8Vo6QK");
    const paymentAmount = 0.0001 * window.solanaWeb3.LAMPORTS_PER_SOL;
    const blockhash = await connection.getLatestBlockhash();

    const transaction = new window.solanaWeb3.Transaction({
        recentBlockhash: blockhash.blockhash,
        feePayer: provider.publicKey,
    }).add(
        window.solanaWeb3.SystemProgram.transfer({
            fromPubkey: provider.publicKey,
            toPubkey: receivingWallet,
            lamports: paymentAmount,
        })
    );

    console.log("🔹 Sending transaction...");
    return await provider.signAndSendTransaction(transaction);
}

async function confirmTransaction(signature) {
    const connection = new window.solanaWeb3.Connection("https://docs-demo.solana-mainnet.quiknode.pro/");
    const blockhash = await connection.getLatestBlockhash();

    try {
        const confirmation = await connection.confirmTransaction(
            {
                signature: signature,
                blockhash: blockhash.blockhash,
                lastValidBlockHeight: blockhash.lastValidBlockHeight
            },
            "confirmed"
        );

        return confirmation.value.err === null;
    } catch (error) {
        console.error("❌ Transaction confirmation failed:", error);
        return false;
    }
}

async function sendVerificationToBackend(tgId, walletAddress, signedMessage) {
    try {
        const res = await fetch("/api/verify-wallet", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tgId, walletAddress, signedMessage }),
        });

        const result = await res.json();
        console.log(result)
        if (result.success) {
            window.postMessage({ type: "SET_WALLET_PUBLIC_KEY", walletAddress }, "*");
            showSuccess(`✅ Payment successful!\nTG User ${tgId} has validated the wallet: ${walletAddress}\n You can now proceed to https://mandog.fun to inject your wallet into the Mandog Trench Tools Chrome Extension. `);
        } else {
            showError("❌ Verification failed.");
        }
    } catch (error) {
        showError("❌ Error contacting backend.");
    }
}

function updateStatus(message, showLoader = false) {
    const statusElement = document.getElementById("status");

    if (showLoader) {
        statusElement.innerHTML = `
            <div class="loading-container">
                <span class="spinner"></span>
                <p>${message}</p>
            </div>
        `;
    } else {
        statusElement.innerHTML = message;
    }
}

function showError(message) {
    console.error(message);
    updateStatus(message);
}

function showSuccess(message) {
    console.log(message);
    updateStatus(message);
}
