import { Connection, PublicKey, Transaction, SystemProgram, clusterApiUrl, LAMPORTS_PER_SOL } from "@solana/web3.js";

// Polyfill Buffer in the browser environment
import { Buffer } from 'buffer';
window.Buffer = Buffer;  // Expose it globally

// Log to confirm Buffer is available globally
console.log("Buffer exposed:", window.Buffer);

// Expose web3.js functionalities to the window object for debugging
window.solanaWeb3 = { Connection, PublicKey, Transaction, SystemProgram, clusterApiUrl,LAMPORTS_PER_SOL };

// Log to confirm solanaWeb3 is available globally
console.log("solanaWeb3 exposed:", window.solanaWeb3);
