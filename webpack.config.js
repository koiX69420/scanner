const path = require("path");

module.exports = {
    mode: "production",  // Use "development" during testing
    entry: "./client.js",  // Your main JS file
    output: {
        filename: "bundle.js",
        path: path.resolve(__dirname, "frontend/public/scripts"),
    },
    resolve: {
        fallback: {
            fs: false, // Solana web3 uses Node.js modules; disable them for browsers
            net: false,
            tls: false,
            buffer: require.resolve('buffer'),  // Ensure 'buffer' is correctly polyfilled

        },
    },
};
