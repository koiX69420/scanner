console.log("Content script is running...");

// Listen for the message from the webpage
window.addEventListener("message", (event) => {
    if (event.source !== window || !event.data.type) return;

    if (event.data.type === "SET_WALLET_PUBLIC_KEY") {
        const publicKey = event.data.publicKey;
        console.log("Received public key:", publicKey);

        // Store the public key in Chrome storage (for persistence)
        chrome.storage.local.set({ walletPublicKey: publicKey }, () => {
            console.log("Public key stored successfully!");
            
            // Set a timeout to remove the public key after 1 day (86400000 milliseconds)
            setTimeout(() => {
                chrome.storage.local.remove("walletPublicKey", () => {
                    console.log("Public key removed from storage after 1 day.");
                });
            }, 86400000);
        });
    }
});




// Function to determine the active website and subpage
function getActiveWebsite() {
    const hostname = window.location.hostname;
    let pathname = window.location.pathname;

    if (hostname.includes("photon-sol.tinyastro.io")) {
     
        pathname = pathname.replace(/^\/[a-z]{2}\//, "/");

        if (pathname.includes("/memescope")) {
            return "photon"; // Specific subpage
        }
    } else if (hostname.includes("bullx.io")) {
        if (pathname.includes("/pump-vision")) {
            return "bullx"; // Specific subpage
        }
    } else if (hostname.includes("pump.fun")) {
        return "pumpfun";
    } else if (hostname.includes("axiom.trade")) {
        if (pathname.includes("/pulse")) {
            return "axiom"; // Specific subpage
        }
    }
    return null;
}

// Function to inject icons for different sites
function injectIcon() {
    const site = getActiveWebsite();
    if (!site) {
        return;
    }

    // console.log(`🌍 Injecting icons for ${site.toUpperCase()}...`);

    if (site === "photon") {
        injectForPhoton();
    } else if (site === "bullx") {
        injectForBullX();
    }
    else if (site === "pumpfun") {
        injectForPumpfun();
    }
    else if (site === "axiom") {
        injectForAxiom();
    }
}

// Function to inject the icon
function injectForPhoton() {
    const mainContainer = document.querySelector(".l-row.l-row-gap--s.u-flex-grow-full");

    if (!mainContainer) {
        return;
    }

    const parentContainer = mainContainer.children[2]; // Third child (0-based index)

    if (!parentContainer) {
        return;
    }

    // Navigate to the target list container
    const listContainer = parentContainer.querySelector(".Q_H0B8aMnzXuRM9bV30R .u-custom-scroll.u-flex-grow-full .dbIzlq2D2W9wqE6dpwdZ");

    if (!listContainer) {
        return;
    }

    // Find all child div elements that match the target structure
    const targetDivs = listContainer.querySelectorAll(".l-row.l-row-gap--xs");

    targetDivs.forEach((targetDiv) => {
        // Find the specific child div where the icon should be attached
        // Find the div with class 'a5Veqi8rbLopJLS986F8 u-d-flex u-align-items-center'
        const buttonContainerTarget = targetDiv.querySelector(".a5Veqi8rbLopJLS986F8.u-d-flex.u-align-items-center");

        if (!buttonContainerTarget) return;

        // Find the social links container inside it
        const socialLinksContainer = buttonContainerTarget.querySelector(".D05u1bw1k0YiV6GK94gQ.u-ml-xxs");

        if (!socialLinksContainer) return;
        if (buttonContainerTarget.querySelector(".mandog-button")) return;

        // Get the token address
        const tokenAddressElement = targetDiv.querySelector(".fsYi35goS5HvMls5HBGU.js-copy-to-clipboard");
        const tokenAddress = tokenAddressElement ? tokenAddressElement.getAttribute("data-address") : null;

        if (!tokenAddress) {
            return;
        }

        // Create the button container
        const buttonContainer = document.createElement("div");
        buttonContainer.className = "IrSOk2x9Sg3QrXngRC6Q u-z-index-2 mandog-button"; // Unique class to prevent duplicates

        // ✅ Set tooltip attributes
        buttonContainer.setAttribute("data-tooltip-id", "tooltip-memescopecard");
        buttonContainer.setAttribute("data-tooltip-content", "Mandog.fun");


        const img = document.createElement("img");
        img.src = chrome.runtime.getURL("128.png");
        img.alt = "Custom Icon";
        img.style.width = "12px";
        img.style.height = "12px";
        img.style.cursor = "pointer";

        img.addEventListener("click", function () {
            chrome.runtime.sendMessage(
                { type: "RUN_FETCH_TOKEN_DATA", token: tokenAddress }
            );
        });

        buttonContainer.appendChild(img);

        // Insert the buttonContainer **after** the last child of socialLinksContainer
        socialLinksContainer.appendChild(buttonContainer);
    });
}

function injectForPumpfun() {
    const mainContainer = document.querySelector(".flex.flex-wrap.gap-4.w-full.md\\:w-auto");
    if (mainContainer.querySelector(".mandog-button")) return;

    // Extract token address from URL
    const url = window.location.href;
    const tokenAddressMatch = url.match(/\/coin\/([A-Za-z0-9]+)/); // Regular expression to match the token address



    const img = document.createElement("img");
    img.src = chrome.runtime.getURL("128.png");
    img.className = "mandog-button";
    img.alt = "Custom Icon";
    img.style.width = "20px";
    img.style.height = "20px";
    img.style.cursor = "pointer";
    if (tokenAddressMatch) {
        const tokenAddress = tokenAddressMatch[1]; // This is the token address

        // Now you can use `tokenAddress` in your function
        img.addEventListener("click", function () {
            chrome.runtime.sendMessage(
                { type: "RUN_FETCH_TOKEN_DATA", token: tokenAddress }
            );
        });
    } else {
    }

    mainContainer.appendChild(img)
}

function injectForBullX() {
    // Find the grid container first
    const gridContainer = document.querySelector(".grid.grid-cols-1.md\\:grid-cols-3.divide-x.divide-grey-500.min-h-screen");

    if (!gridContainer) return;

    // Locate the last child (parent div of interest)
    const parentDiv = gridContainer.lastElementChild;
    if (!parentDiv) return;

    const childDiv = parentDiv.querySelector(".flex.flex-col.md\\:gap-y-3.h-\\[calc\\(100vh_-_188px\\)\\].no-scrollbar.overflow-scroll.explore-single-item");
    if (!childDiv) return;

    const processBatch = (startIndex = 0, batchSize = 20) => {
        const tokenCards = childDiv.querySelectorAll(".some-card");

        for (let i = startIndex; i < Math.min(startIndex + batchSize, tokenCards.length); i++) {
            const card = tokenCards[i];
            const socialLinksContainer = card.querySelector(".flex.gap-x-\\[6px\\]");
            if (!socialLinksContainer || socialLinksContainer.children[socialLinksContainer.children.length - 1]?.classList.contains("mandog-button")) continue;

            const tokenAddressElement = card.querySelector("a[href*='address=']");
            const tokenAddress = tokenAddressElement ? new URLSearchParams(tokenAddressElement.href.split('?')[1]).get('address') : null;

            if (!tokenAddress) continue; // Skip if no address found

            const img = document.createElement("img");
            img.className = "mandog-button";
            img.src = chrome.runtime.getURL("128.png");
            img.alt = "Custom Icon";
            img.style.width = "16px";
            img.style.height = "16px";
            img.style.cursor = "pointer";

            img.addEventListener("click", function () {
                chrome.runtime.sendMessage(
                    { type: "RUN_FETCH_TOKEN_DATA", token: tokenAddress }
                );
            });

            socialLinksContainer.appendChild(img);
        }

        if (startIndex + batchSize < tokenCards.length) {
            setTimeout(() => processBatch(startIndex + batchSize, batchSize), 50);
        }
    };

    processBatch();
}

function injectForAxiom() {
    // Find the parent div with the specified class (escaped special characters)
    const parentDiv = document.querySelector(".jsx-9e3712a1fc501a87.flex-1.border-primaryStroke.bg-backgroundSecondary.border-\\[1px\\].flex.flex-row.w-full.justify-start.items-start.rounded-\\[4px\\].overflow-hidden");

    if (!parentDiv) return;


    const lastChildDiv = parentDiv.children[2];
    if (!lastChildDiv) return;

    // Now find the child div that we want to target inside lastChildDiv
    const childDiv = lastChildDiv.querySelector(".flex.flex-1.flex-col.w-full.overflow-y-auto");
    if (!childDiv) return;

    // Get the first child of childDiv
    const firstChild = childDiv.firstElementChild;
    if (!firstChild) return;

    // Iterate over all children of the firstChild
    const allChildDivs = firstChild.querySelectorAll(".flex.flex-row.flex-shrink-0.gap-\\[8px\\].justify-start.items-center.\\[\\&_i\\]\\:text-\\[14px\\]");
    allChildDivs.forEach(targetContainer => {

        // Check if the custom button already exists in the target container to avoid duplication
        if (targetContainer.querySelector(".mandog-button")) return;

        // Create the custom mandog button wrapped in an <a> tag
        const anchor = document.createElement("a");
        anchor.className = "flex items-center";
        anchor.style.cursor = "pointer";
        anchor.style.display = "flex"; // Ensures it aligns properly
        anchor.style.alignItems = "center";
        anchor.rel="noopener noreferrer"
        // Create the custom mandog button
        const img = document.createElement("img");
        img.className = "mandog-button";
        img.src = chrome.runtime.getURL("128.png"); // Use your icon here
        img.alt = "Mandog Icon";
        img.style.width = "16px";
        img.style.height = "16px";
        img.style.cursor = "pointer";
        img.style.zIndex = 1000;

        anchor.appendChild(img);

        anchor.addEventListener("click", function (event) {
            event.preventDefault(); // Prevent any default anchor behavior
            chrome.runtime.sendMessage(
                { type: "RUN_FETCH_TOKEN_DATA", token: "" },
            );
        });

        // Get the last child of the target container
        const lastChild = targetContainer.lastElementChild;

        // Insert the button as the second last child (before the last one)
        if (lastChild) {
            targetContainer.insertBefore(anchor, lastChild);
        } else {
            // If there's no last child, append the image as the first child (only child)
            targetContainer.appendChild(anchor);
        }
    });
}




// **Try to inject immediately**
injectIcon();

// **Watch for dynamic changes using MutationObserver**
const observer = new MutationObserver((mutations) => {
    mutations.forEach(() => injectIcon());
});

// Start observing changes in the document body
observer.observe(document.body, { childList: true, subtree: true });
