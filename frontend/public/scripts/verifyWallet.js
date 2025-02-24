// Check if the current page is the verify page with tgId in the URL
if (window.location.pathname === "/verify" && new URLSearchParams(window.location.search).has("tgId")) {
updateStatus("🔹 Starting wallet verification...")

    async function verifyWallet() {
        const params = new URLSearchParams(window.location.search);
        const tgId = params.get("tgId");

        if (!tgId) return showError("Missing Telegram ID!");

        // Check if wallet is already verified
        const validationData = await checkTgValidation(tgId);
        if (validationData.success) {
            const daysLeft = getDaysLeft(validationData.last_updated);
            if (daysLeft > 0) {
                return showSuccess(`✅ TG User ${tgId} is already validated with the wallet: ${validationData.publicKey} (${daysLeft} days remaining)`);
            }
        }

        try {
            const provider = getSolanaProvider();
            const walletAddress = await connectWallet(provider);
            const signedMessage = await signVerificationMessage(provider, tgId);
            updateStatus(`Owner of <b>${walletAddress}</b> confirmed.\n Proceed with payment to verify Telegram User with ID:<b>${tgId}</b>.`)
            const rpcUrl = await getRPCUrl();

            const connection = new window.solanaWeb3.Connection(rpcUrl);
            const signature = await processPayment(provider,connection);

            updateStatus(" Please wait, confirming payment...",true);
            const isConfirmed = await confirmTransaction(signature.signature,connection);
            
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

if (window.location.pathname === "/deviceupdate" && new URLSearchParams(window.location.search).has("tgId")) {
    updateStatus("🔹 Starting device update...");

    async function updateDevice() {
        const params = new URLSearchParams(window.location.search);
        const tgId = params.get("tgId");

        if (!tgId) return showError("Missing Telegram ID!");

        // Check if wallet is already verified
        const validationData = await checkTgValidation(tgId);
        if (!validationData.success) {
            return showError("❌ Telegram ID is not verified. Please complete the verification process first.");
        }

        try {
            const provider = getSolanaProvider();
            const walletAddress = await connectWallet(provider);
            const signedMessage = await signVerificationMessage(provider, tgId);

            updateStatus(`Owner of <b>${walletAddress}</b> confirmed.\n Proceed with device update for Telegram User with ID:<b>${tgId}</b>.`);

            // No payment involved for device update, just proceed with sending the device data
            await senddeviceupdateToBackend(tgId, walletAddress, signedMessage);

        } catch (error) {
            showError(`❌ Error: ${error.message}`);
        }
    }

    updateDevice();
} else {
    console.log("This is not the correct device update page.");
}

async function senddeviceupdateToBackend(tgId, walletAddress, signedMessage) {
    try {
        // Get the current device data (navigator data) to send along with the request
        const deviceData = {
            tgId,
            walletAddress,
            signedMessage,
            hardwareConcurrency: navigator.hardwareConcurrency,
            deviceMemory: navigator.deviceMemory,
            language: navigator.language,
            userAgent: navigator.userAgent
        };

        // Send a POST request to the backend /update-device endpoint
        const res = await fetch("/api/update-device", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(deviceData)
        });

        const result = await res.json();

        if (result.success) {
            showSuccess(`✅ Device data updated successfully for user with Telegram ID: ${tgId}!`);
        } else {
            // Show the specific error message returned by the backend
            showError(`❌ Device update failed: ${result.error}`);
        }
    } catch (error) {
        showError("❌ Error contacting backend for device update.");
        console.error("❌ Error sending device update:", error);
    }
}
// ✅ Helper Functions

async function checkTgValidation(tgId) {
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

async function getSubWallet() {
    const response = await fetch("/get-sub-wallet");
    const data = await response.json();
    return data.subWallet;
}
async function processPayment(provider,connection) {
    const subWallet = await getSubWallet();

    const receivingWallet = new window.solanaWeb3.PublicKey(subWallet);
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

async function confirmTransaction(signature,connection) {
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
        const verificationData= {
            tgId,
            walletAddress,
            signedMessage,
            hardwareConcurrency: navigator.hardwareConcurrency,
            deviceMemory: navigator.deviceMemory,
            language: navigator.language,
            userAgent: navigator.userAgent
        };

        const res = await fetch("/api/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(verificationData),
        });

        const result = await res.json();
        console.log(result)
        if (result.success) {
            window.postMessage({ type: "SET_WALLET_PUBLIC_KEY", walletAddress }, "*");
            updateStatus(`✅ Payment successful!<br>TG User <b>${tgId}</b> has validated the wallet: <b>${walletAddress}</b><br>You can now proceed to <a href="https://mandog.fun/" target="_blank" rel="noopener noreferrer">mandog.fun</a> in order to inject your wallet into the Mandog Trench Tools Chrome Extension`);
        } else {
            // Show the specific error message returned by the backend
            showError(`❌ Verification failed: ${result.error}`);
        }
    } catch (error) {
        showError("❌ Error contacting backend for verification.");
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
