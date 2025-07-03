// --- Web3 Global Variables ---
let provider; // For reading blockchain data
let signer;   // For sending transactions (requires user wallet)
let account;  // Stores the currently connected wallet address

// --- Contract Addresses & ABIs (PLACEHOLDERS - YOU MUST UPDATE THESE) ---
// !!! IMPORTANT: Replace these with the actual addresses of your deployed contracts !!!
// You'll get these addresses after deploying your Solidity contracts to a testnet (e.g., Sepolia) or mainnet.
const ETH_STAKING_CONTRACT_ADDRESS = "0xYourEthStakingContractAddress"; // Example: "0xABC123..."
const USDC_MINING_CONTRACT_ADDRESS = "0xYourUsdcMiningContractAddress"; // Example: "0xDEF456..."
// For USDC, you might use a well-known address if deploying on mainnet or common testnets.
// For Sepolia testnet, you might need to deploy your own mock USDC or find a test USDC contract.
const USDC_TOKEN_ADDRESS = "0xYourUsdcTokenAddress"; // Example: "0x123456..." (Common testnets might have mock USDC)

// This is the specific wallet address you provided for NFT payments / general crypto sending.
const TARGET_PAYMENT_ADDRESS = "0x0171176DCE67dd825317942F5705762002B748Ab";

// --- Contract ABIs (Application Binary Interfaces) ---
// These are minimal ABIs containing only the functions we intend to call from the frontend.
// !!! IMPORTANT: Replace these with the actual ABIs of your deployed contracts !!!
// You can usually get the full ABI from your smart contract compilation output (e.g., in a JSON file).

// ABI for your EthStaking contract
const ETH_STAKING_ABI = [
    "function stake() payable",          // Allows users to send ETH to the contract
    "function withdrawTreasury()",        // Admin function to withdraw ETH from the contract
    // Add other functions you need to interact with, e.g.:
    // "function getStakedAmount(address user) view returns (uint256)",
    // "function unstake(uint256 amount)", // If users can unstake
    "event Staked(address indexed user, uint256 amount, uint256 timestamp)"
];

// ABI for your UsdcMiner contract
const USDC_MINING_ABI = [
    "function startMining(uint256 nftLevel)", // To start mining with a specific NFT level
    "function claimRewards(uint256 nftLevel)",// To claim accumulated USDC rewards
    "function withdrawUsdc()",             // Admin function to withdraw USDC from the contract
    // Add other functions you need to interact with, e.g.:
    // "function getMiningData(address user) view returns (uint256 lastClaimTime, uint256 currentRate)",
    "event MiningStarted(address indexed user, uint256 nftLevel)",
    "event RewardsClaimed(address indexed user, uint256 amount)"
];

// ABI for a standard ERC20 token (like USDC)
const ERC20_ABI = [
    "function transfer(address to, uint256 amount) returns (bool)", // To send tokens
    "function balanceOf(address account) view returns (uint256)",   // To check balance
    "function decimals() view returns (uint8)",                     // To get token decimals
    "function approve(address spender, uint256 amount) returns (bool)" // If you need allowance for spending
];

// Ethers.js contract instances
let ethStakingContract;
let usdcMiningContract;
let usdcTokenContract;
let usdcDecimals = 6; // Default to 6 decimals for USDC; will try to fetch from contract

// --- NFT Data Configuration ---
// This object defines the properties of each NFT level for the "Buy NFT" and "Mining" sections.
const NFT_DATA = {
    1: { priceEth: 0.1, miningRateUsdc: 1, name: "Level 1" },
    2: { priceEth: 0.25, miningRateUsdc: 2, name: "Level 2" },
    3: { priceEth: 0.5, miningRateUsdc: 4, name: "Level 3" },
    4: { priceEth: 1.0, miningRateUsdc: 8, name: "Level 4" },
};


// --- UI Utility Functions ---

/**
 * Updates the text content and styling of a status element on the page.
 * @param {string} elementId - The ID of the HTML element to update.
 * @param {string} message - The message to display.
 * @param {'info'|'success'|'error'} type - The type of status (for styling).
 */
function updateStatus(elementId, message, type = 'info') {
    const statusElement = document.getElementById(elementId);
    if (statusElement) {
        statusElement.textContent = message;
        statusElement.className = `form-status ${type}`; // Applies CSS classes
    }
}

/**
 * Disables a button, changes its text to a loading message, and adds a loading class.
 * @param {HTMLButtonElement} buttonElement - The button DOM element.
 * @param {string} [loadingText='Processing...'] - The text to display while loading.
 */
function showLoader(buttonElement, loadingText = 'Processing...') {
    buttonElement.disabled = true;
    buttonElement.textContent = loadingText;
    buttonElement.classList.add('loading'); // Add 'loading' class for visual feedback
}

/**
 * Re-enables a button, restores its original text, and removes the loading class.
 * @param {HTMLButtonElement} buttonElement - The button DOM element.
 * @param {string} originalText - The original text content of the button.
 */
function hideLoader(buttonElement, originalText) {
    buttonElement.disabled = false;
    buttonElement.textContent = originalText;
    buttonElement.classList.remove('loading');
}

/**
 * Updates the UI to display connected wallet information.
 * @param {string} address - The connected wallet address.
 */
function displayWalletInfo(address) {
    document.getElementById('connect-wallet-btn').classList.add('hidden');
    document.getElementById('wallet-info-display').classList.remove('hidden');
    document.getElementById('walletAddress').textContent = `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
    updateStatus('wallet-status', 'Wallet Connected.', 'success');
}

/**
 * Updates the UI to reflect a disconnected wallet state.
 */
function hideWalletInfo() {
    document.getElementById('connect-wallet-btn').classList.remove('hidden');
    document.getElementById('wallet-info-display').classList.add('hidden');
    document.getElementById('walletAddress').textContent = '';
    updateStatus('wallet-status', 'Wallet Disconnected.', 'info');
}


// --- Wallet Connection & Disconnection Logic ---

/**
 * Handles connecting the user's Web3 wallet (e.g., MetaMask).
 * Initializes provider, signer, and contract instances.
 */
async function connectWallet() {
    // Check if MetaMask or another Web3 provider is available
    if (typeof window.ethereum === 'undefined') {
        updateStatus('wallet-status', 'Please install MetaMask or another Web3 wallet to proceed.', 'error');
        alert("MetaMask is not installed. Please install it to use this DApp.");
        return;
    }

    try {
        // Request account access from the user (opens MetaMask popup)
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        account = accounts[0]; // Set the first connected account

        // Initialize ethers provider and signer
        // A Web3Provider wraps a standard Web3 provider (like MetaMask's window.ethereum)
        provider = new ethers.providers.Web3Provider(window.ethereum);
        signer = provider.getSigner(); // The signer represents the connected user's wallet, used for sending transactions

        // Initialize contract instances with the signer
        // This allows us to send transactions to these contracts from the connected wallet
        ethStakingContract = new ethers.Contract(ETH_STAKING_CONTRACT_ADDRESS, ETH_STAKING_ABI, signer);
        usdcMiningContract = new ethers.Contract(USDC_MINING_CONTRACT_ADDRESS, USDC_MINING_ABI, signer);
        usdcTokenContract = new ethers.Contract(USDC_TOKEN_ADDRESS, ERC20_ABI, signer);

        // Try to fetch USDC decimals from the contract
        try {
            usdcDecimals = await usdcTokenContract.decimals();
        } catch (e) {
            console.warn("Could not fetch USDC decimals from contract, defaulting to 6. Ensure USDC_TOKEN_ADDRESS is correct.", e);
            usdcDecimals = 6; // Fallback to 6 decimals if fetch fails
        }

        displayWalletInfo(account); // Update UI to show connected wallet
        // Enable buttons that require a connected wallet for interaction
        document.querySelectorAll('.btn.action-btn, .buy-nft-btn').forEach(btn => btn.disabled = false);
    } catch (error) {
        console.error("Error connecting wallet:", error);
        // Provide user-friendly error message
        updateStatus('wallet-status', `Connection Error: ${error.message || "Failed to connect wallet."}`, 'error');
    }
}

/**
 * Handles disconnecting the user's Web3 wallet (clears session data).
 */
function disconnectWallet() {
    // Reset all global Web3 related variables
    account = null;
    provider = null;
    signer = null;
    ethStakingContract = null;
    usdcMiningContract = null;
    usdcTokenContract = null;
    usdcDecimals = 6; // Reset to default

    hideWalletInfo(); // Update UI to show disconnected state
    // Disable all interactive buttons
    document.querySelectorAll('.btn.action-btn, .buy-nft-btn').forEach(btn => btn.disabled = true);
    // Reset any displayed balances/statuses back to initial state
    updateStatus('staking-status', 'Enter ETH amount and stake.', 'info');
    updateStatus('mining-status', 'Select NFT and start mining.', 'info');
    updateStatus('buy-nft-status', 'Select NFT level to purchase.', 'info');
    updateStatus('send-crypto-status', 'Enter amount and currency to send.', 'info');
    document.getElementById('current-mining-nft').textContent = 'N/A';
    document.getElementById('current-mining-rate').textContent = 'N/A';
    document.getElementById('accumulated-usdc').textContent = '0.00 USDC';
}

// --- Event Listeners for MetaMask Account/Chain Changes ---
// These ensure the DApp reacts dynamically if the user changes accounts or network in MetaMask
if (typeof window.ethereum !== 'undefined') {
    // Listen for account changes
    window.ethereum.on('accountsChanged', (accounts) => {
        if (accounts.length === 0) {
            // User disconnected all accounts in MetaMask
            disconnectWallet();
        } else {
            // Account changed, re-initialize to use the new account
            account = accounts[0];
            connectWallet();
        }
    });

    // Listen for network (chain) changes
    window.ethereum.on('chainChanged', (chainId) => {
        // It's generally safest to reload the page when the chain changes
        // to ensure all contract instances and UI elements are correctly re-initialized for the new network.
        window.location.reload();
    });
}


// --- ETH Staking Functionality ---

/**
 * Initiates an ETH staking transaction.
 */
async function stakeEth() {
    if (!signer || !ethStakingContract) {
        updateStatus('staking-status', 'Please connect your wallet first.', 'error');
        return;
    }

    const ethAmountInput = document.getElementById('eth-amount');
    const amount = ethAmountInput.value;
    if (!amount || parseFloat(amount) <= 0) {
        updateStatus('staking-status', 'Please enter a valid ETH amount.', 'error');
        return;
    }

    const stakeBtn = document.getElementById('stake-eth-btn');
    showLoader(stakeBtn, 'Staking...');
    updateStatus('staking-status', `Sending transaction to stake ${amount} ETH...`, 'info');

    try {
        // Convert the human-readable ETH amount to Wei (BigNumber)
        const amountWei = ethers.utils.parseEther(amount);
        // Call the 'stake' function on your EthStaking contract, sending the ETH with the transaction
        const tx = await ethStakingContract.stake({ value: amountWei });

        updateStatus('staking-status', 'Transaction submitted! Waiting for confirmation...', 'info');
        await tx.wait(); // Wait for the transaction to be mined and confirmed on the blockchain

        updateStatus('staking-status', `Successfully staked ${amount} ETH! Your balance will update shortly.`, 'success');
        ethAmountInput.value = ''; // Clear input field
        // In a real DApp, you might fetch and display the new staked balance here
    } catch (error) {
        console.error("Error staking ETH:", error);
        // Display a user-friendly error message, extracting reason if available
        updateStatus('staking-status', `Error: ${error.reason || error.message || "Transaction denied or failed."}`, 'error');
    } finally {
        hideLoader(stakeBtn, 'Stake ETH'); // Restore button state
    }
}


// --- USDC Mining Functionality ---

/**
 * Initiates the USDC mining process for a selected NFT level.
 */
async function startMining() {
    if (!signer || !usdcMiningContract) {
        updateStatus('mining-status', 'Please connect your wallet first.', 'error');
        return;
    }

    const nftLevelSelect = document.getElementById('nft-level');
    const nftLevel = parseInt(nftLevelSelect.value); // Get the selected NFT level (1-4)

    // Update UI to display the selected NFT's name and mining rate immediately
    const nftInfo = NFT_DATA[nftLevel];
    if (nftInfo) {
        document.getElementById('current-mining-nft').textContent = nftInfo.name;
        document.getElementById('current-mining-rate').textContent = `${nftInfo.miningRateUsdc} USDC/hour`;
    } else {
        document.getElementById('current-mining-nft').textContent = 'Invalid Level';
        document.getElementById('current-mining-rate').textContent = 'N/A';
    }


    const startMiningBtn = document.getElementById('start-mining-btn');
    showLoader(startMiningBtn, 'Starting Mining...');
    updateStatus('mining-status', `Sending transaction to start mining with NFT Level ${nftLevel}...`, 'info');

    try {
        // Call the 'startMining' function on your UsdcMiner contract
        const tx = await usdcMiningContract.startMining(nftLevel);
        updateStatus('mining-status', 'Transaction submitted! Waiting for confirmation...', 'info');
        await tx.wait(); // Wait for confirmation

        updateStatus('mining-status', `Successfully started USDC mining with NFT Level ${nftLevel}!`, 'success');
        // You might want to periodically fetch and update 'accumulated-usdc' here
    } catch (error) {
        console.error("Error starting mining:", error);
        updateStatus('mining-status', `Error: ${error.reason || error.message || "Transaction denied or failed."}`, 'error');
    } finally {
        hideLoader(startMiningBtn, 'Start Mining');
    }
}

/**
 * Claims accumulated USDC rewards from the mining contract.
 */
async function claimRewards() {
    if (!signer || !usdcMiningContract) {
        updateStatus('mining-status', 'Please connect your wallet first.', 'error');
        return;
    }

    const nftLevelSelect = document.getElementById('nft-level');
    const nftLevel = parseInt(nftLevelSelect.value); // Assuming claim also needs NFT level for context in contract

    const claimRewardsBtn = document.getElementById('claim-rewards-btn');
    showLoader(claimRewardsBtn, 'Claiming Rewards...');
    updateStatus('mining-status', 'Sending transaction to claim USDC rewards...', 'info');

    try {
        // Call the 'claimRewards' function on your UsdcMiner contract
        const tx = await usdcMiningContract.claimRewards(nftLevel);
        updateStatus('mining-status', 'Transaction submitted! Waiting for confirmation...', 'info');
        await tx.wait(); // Wait for confirmation

        updateStatus('mining-status', `Successfully claimed USDC rewards! Check your wallet.`, 'success');
        document.getElementById('accumulated-usdc').textContent = '0.00 USDC'; // Reset displayed accumulated amount after claiming
    } catch (error) {
        console.error("Error claiming USDC rewards:", error);
        updateStatus('mining-status', `Error: ${error.reason || error.message || "Transaction denied or failed."}`, 'error');
    } finally {
        hideLoader(claimRewardsBtn, 'Claim Rewards');
    }
}


// --- Buy NFT Functionality (Simulated) ---

/**
 * Simulates purchasing an NFT by sending ETH to a target address.
 * In a real DApp, this would trigger an NFT minting/transfer via a smart contract.
 * @param {number} level - The NFT level being purchased.
 * @param {number} priceEth - The price of the NFT in ETH.
 */
async function buyNft(level, priceEth) {
    if (!signer) {
        updateStatus('buy-nft-status', 'Please connect your wallet first.', 'error');
        return;
    }

    const priceWei = ethers.utils.parseEther(priceEth.toString()); // Convert ETH price to Wei
    const buyButton = event.target; // Get the specific button that was clicked to apply loader
    const originalText = buyButton.textContent;
    showLoader(buyButton, `Buying Level ${level}...`);
    updateStatus('buy-nft-status', `Sending ${priceEth} ETH to purchase NFT Level ${level}...`, 'info');

    try {
        // Send ETH directly from the user's wallet to the TARGET_PAYMENT_ADDRESS
        const tx = await signer.sendTransaction({
            to: TARGET_PAYMENT_ADDRESS,
            value: priceWei // The amount in Wei
        });

        updateStatus('buy-nft-status', 'Transaction submitted! Waiting for confirmation...', 'info');
        await tx.wait(); // Wait for transaction confirmation

        updateStatus('buy-nft-status', `Successfully sent ${priceEth} ETH for NFT Level ${level}!`, 'success');
        // Note: This only handles the payment. A real NFT purchase would involve
        // a smart contract that mints/transfers the NFT to the buyer's address
        // upon receiving payment. This example simulates just the payment part.
    } catch (error) {
        console.error("Error buying NFT:", error);
        updateStatus('buy-nft-status', `Error: ${error.reason || error.message || "Transaction denied or failed."}`, 'error');
    } finally {
        hideLoader(buyButton, originalText); // Restore button state
    }
}


// --- Send Crypto (ETH/USDC) Functionality ---

/**
 * Sends a specified amount of ETH or USDC to a target address.
 */
async function sendCrypto() {
    if (!signer) {
        updateStatus('send-crypto-status', 'Please connect your wallet first.', 'error');
        return;
    }

    const amountInput = document.getElementById('send-amount');
    const currencySelect = document.getElementById('send-currency');
    const toAddressInput = document.getElementById('send-to-address');

    const amount = amountInput.value;
    const currency = currencySelect.value;
    const toAddress = toAddressInput.value;

    // Basic input validations
    if (!amount || parseFloat(amount) <= 0) {
        updateStatus('send-crypto-status', 'Please enter a valid amount.', 'error');
        return;
    }
    if (!ethers.utils.isAddress(toAddress)) {
        updateStatus('send-crypto-status', 'Invalid recipient wallet address.', 'error');
        return;
    }

    const sendBtn = document.getElementById('send-crypto-btn');
    showLoader(sendBtn, `Sending ${currency}...`);
    updateStatus('send-crypto-status', `Sending ${amount} ${currency} to ${toAddress}...`, 'info');

    try {
        let tx;
        if (currency === 'ETH') {
            // Convert ETH amount to Wei
            const amountWei = ethers.utils.parseEther(amount);
            // Send ETH directly from the signer's wallet
            tx = await signer.sendTransaction({
                to: toAddress,
                value: amountWei
            });
        } else if (currency === 'USDC') {
            if (!usdcTokenContract) {
                updateStatus('send-crypto-status', 'USDC token contract not initialized. Check USDC_TOKEN_ADDRESS.', 'error');
                return;
            }
            // Convert USDC amount to correct token units using its decimals
            const amountUsdc = ethers.utils.parseUnits(amount, usdcDecimals);
            // Call the 'transfer' function on the USDC ERC20 contract
            tx = await usdcTokenContract.transfer(toAddress, amountUsdc);
        } else {
            updateStatus('send-crypto-status', 'Unsupported currency selected.', 'error');
            return;
        }

        updateStatus('send-crypto-status', 'Transaction submitted! Waiting for confirmation...', 'info');
        await tx.wait(); // Wait for transaction confirmation

        updateStatus('send-crypto-status', `Successfully sent ${amount} ${currency} to ${toAddress}!`, 'success');
        amountInput.value = ''; // Clear input field
    } catch (error) {
        console.error("Error sending crypto:", error);
        updateStatus('send-crypto-status', `Error: ${error.reason || error.message || "Transaction denied or failed."}`, 'error');
    } finally {
        hideLoader(sendBtn, 'Send');
    }
}


// --- Admin Withdrawal Functions (for platform owner) ---
// These functions are assumed to have access control within the smart contract
// allowing only the contract owner to call them.

/**
 * Withdraws all ETH from the staking contract to the treasury wallet.
 */
async function withdrawEth() {
    if (!signer || !ethStakingContract) {
        updateStatus('withdraw-status', 'Please connect your wallet first.', 'error');
        return;
    }

    const withdrawEthBtn = document.getElementById('withdraw-eth-btn');
    showLoader(withdrawEthBtn, 'Withdrawing ETH...');
    updateStatus('withdraw-status', 'Sending transaction to withdraw all ETH from contract...', 'info');

    try {
        // Call the 'withdrawTreasury' function on your EthStaking contract
        const tx = await ethStakingContract.withdrawTreasury();
        updateStatus('withdraw-status', 'Transaction submitted! Waiting for confirmation...', 'info');
        await tx.wait();

        updateStatus('withdraw-status', `Successfully withdrew all ETH to the treasury wallet!`, 'success');
    } catch (error) {
            console.error("Error withdrawing ETH from treasury:", error);
            // Provide specific error if user is not the owner (common access control error)
            const errorMessage = (error.reason && error.reason.includes("Ownable: caller is not the owner"))
                               ? "Error: Only the contract owner can perform this action."
                               : `Error: ${error.reason || error.message || "Transaction denied or failed."}`;
            updateStatus('withdraw-status', errorMessage, 'error');
    } finally {
        hideLoader(withdrawEthBtn, 'Withdraw All ETH');
    }
}

/**
 * Withdraws all USDC from the mining contract to the treasury wallet.
 */
async function withdrawUsdc() {
    if (!signer || !usdcMiningContract || !usdcTokenContract) {
        updateStatus('withdraw-status', 'Please connect your wallet first.', 'error');
        return;
    }

    const withdrawUsdcBtn = document.getElementById('withdraw-usdc-btn');
    showLoader(withdrawUsdcBtn, 'Withdrawing USDC...');
    updateStatus('withdraw-status', 'Sending transaction to withdraw all USDC from contract...', 'info');

    try {
        // Call the 'withdrawUsdc' function on your UsdcMiner contract
        const tx = await usdcMiningContract.withdrawUsdc();
        updateStatus('withdraw-status', 'Transaction submitted! Waiting for confirmation...', 'info');
        await tx.wait();

        updateStatus('withdraw-status', `Successfully withdrew all USDC to the treasury wallet!`, 'success');
    } catch (error) {
        console.error("Error withdrawing USDC from treasury:", error);
         const errorMessage = (error.reason && error.reason.includes("Ownable: caller is not the owner"))
                               ? "Error: Only the contract owner can perform this action."
                               : `Error: ${error.reason || error.message || "Transaction denied or failed."}`;
        updateStatus('withdraw-status', errorMessage, 'error');
    } finally {
        hideLoader(withdrawUsdcBtn, 'Withdraw All USDC');
    }
}


// --- Main Initialization and Event Listener Setup ---

document.addEventListener('DOMContentLoaded', () => {
    // 1. Initial Wallet Check
    // Attempt to connect wallet automatically if MetaMask is already detected and an account is selected
    if (window.ethereum && window.ethereum.selectedAddress) {
        connectWallet();
    } else {
        // If no wallet is connected on page load, disable interactive buttons
        document.querySelectorAll('.btn.action-btn, .buy-nft-btn').forEach(btn => btn.disabled = true);
    }

    // 2. Assign Event Listeners to Buttons
    // Wallet section
    document.getElementById('connect-wallet-btn').addEventListener('click', connectWallet);
    document.getElementById('disconnect-wallet-btn').addEventListener('click', disconnectWallet);

    // ETH Staking section
    document.getElementById('stake-eth-btn').addEventListener('click', stakeEth);

    // USDC Mining section
    document.getElementById('start-mining-btn').addEventListener('click', startMining);
    document.getElementById('claim-rewards-btn').addEventListener('click', claimRewards);

    // Send Crypto section
    document.getElementById('send-crypto-btn').addEventListener('click', sendCrypto);

    // Admin Withdrawal section
    document.getElementById('withdraw-eth-btn').addEventListener('click', withdrawEth);
    document.getElementById('withdraw-usdc-btn').addEventListener('click', withdrawUsdc);

    // Event listeners for NFT Buy buttons (using event delegation for multiple buttons)
    // We select all buttons with the class 'buy-nft-btn' and attach a click listener to each.
    document.querySelectorAll('.buy-nft-btn').forEach(button => {
        button.addEventListener('click', (event) => {
            // Traverse up the DOM to find the parent 'nft-buy-card' to extract data attributes
            const card = event.target.closest('.nft-buy-card');
            const level = parseInt(card.dataset.level); // Get level from data-level attribute
            const price = parseFloat(card.dataset.price); // Get price from data-price attribute
            buyNft(level, price); // Call the buyNft function
        });
    });

    // 3. Set Initial Status Messages
    // Provide informative messages to the user when the page loads
    updateStatus('wallet-status', 'Wallet not connected.', 'info');
    updateStatus('buy-nft-status', 'Select an NFT level to purchase.', 'info');
    updateStatus('staking-status', 'Enter ETH amount and stake.', 'info');
    updateStatus('mining-status', 'Select NFT and start mining.', 'info');
    updateStatus('send-crypto-status', 'Enter amount and currency to send.', 'info');
    updateStatus('withdraw-status', 'Admin function for platform fund withdrawal.', 'info');
});
        
