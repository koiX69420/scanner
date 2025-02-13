console.log("Content script is running...");

// Function to inject the icon
function injectIcon() {
    const mainContainer = document.querySelector(".l-row.l-row-gap--s.u-flex-grow-full");

    if (!mainContainer) {
        console.warn("Main container not found!");
        return;
    }

    const parentContainer = mainContainer.children[2]; // Third child (0-based index)

    if (!parentContainer) {
        console.warn("Parent container not found!");
        return;
    }

    // Navigate to the target list container
    const listContainer = parentContainer.querySelector(".Q_H0B8aMnzXuRM9bV30R .u-custom-scroll.u-flex-grow-full .dbIzlq2D2W9wqE6dpwdZ");

    if (!listContainer) {
        console.warn("List container not found!");
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
            console.warn("Token address not found for this item.");
            return;
        }

        // Create the button container
        const buttonContainer = document.createElement("div");
        buttonContainer.className = "IrSOk2x9Sg3QrXngRC6Q u-z-index-2 mandog-button"; // Unique class to prevent duplicates

        // Create the image element for the button
        const img = document.createElement("img");
        img.src = chrome.runtime.getURL("128.png"); // Get the image from extension assets
        img.alt = "Custom Icon";
        img.style.width = "12px"; // Adjust size as needed
        img.style.height = "12px";
        img.style.cursor="pointer"

        // Add click event listener to the button
        img.addEventListener("click", function () {
            console.log("Token Address Clicked:", tokenAddress);

            chrome.runtime.sendMessage(
                {
                    type: "RUN_FETCH_TOKEN_DATA",
                    token: tokenAddress,
                },
                function (response) {
                    console.log("Response from extension:", response);
                }
            );
        });
        // Append the image to the button

        buttonContainer.appendChild(img);

        // Insert the buttonContainer **after** the last child of socialLinksContainer
        socialLinksContainer.appendChild(buttonContainer);


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
