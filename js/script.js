// --- Web3 Global Variables ---
let provider;
let signer;
let account;

// Contract Instances (Placeholders - REPLACE with your actual ABIs and Addresses)
// !!! IMPORTANT: Update these with your deployed contract addresses !!!
const ETH_STAKING_CONTRACT_ADDRESS = "0xYourEthStakingContractAddress";
const USDC_MINING_CONTRACT_ADDRESS = "0xYourUsdcMiningContractAddress";
const USDC_TOKEN_ADDRESS = "0xYourUsdcTokenAddress"; // e.g., "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" for USDC on Ethereum Mainnet

// The specific address provided by the user for NFT payments / general crypto sending
const TARGET_PAYMENT_ADDRESS = "0x0171176DCE67dd825317942F5705762002B748Ab";

// Minimal ABI for ETH Staking (replace with full ABI of your contract)
// This ABI must match the functions you call (stake, withdrawTreasury)
const ETH_STAKING_ABI = [
    "function stake() payable",
    "function withdrawTreasury()", // Example: owner only function
    // Add other functions from your EthStaking contract if you use them, e.g.:
    // "function getStakedAmount(address user) view returns (uint256)",
    "event Staked(address indexed user, uint256 amount, uint256 timestamp)"
];

// Minimal ABI for USDC Mining (replace with full ABI of your contract)
// This ABI must match the functions you call (startMining, claimRewards)
const USDC_MINING_ABI = [
    "function startMining(uint256 nftLevel)",
    "function claimRewards(uint256 nftLevel)",
    "function withdrawUsdc()", // Example: owner only function
    // Add other functions from your UsdcMiner contract if you use them, e.g.:
    // "function getMiningData(address user) view returns (uint256 lastClaimTime, uint256 currentRate)",
    "event MiningStarted(address indexed user, uint256 nftLevel)",
    "event RewardsClaimed(address indexed user, uint256 amount)"
];

// Minimal ABI for ERC20 (USDC)
// This ABI must match the functions you call (transfer, balanceOf, decimals, approve)
const ERC20_ABI = [
    "function transfer(address to, uint256 amount) returns (bool)",
    "function balanceOf(address account) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function approve(address spender, uint256 amount) returns (bool)"
];

let ethStakingContract;
let usdcMiningContract;
let usdcTokenContract;
let usdcDecimals = 6; // Most USDC tokens use 6 decimals, but confirm for your testnet/mainnet

// Define NFT levels, their prices (in ETH) and mining rates (USDC/hour)
const NFT_DATA = {
    1: { priceEth: 0.1, miningRateUsdc: 1 },
    2: { priceEth: 0.25, miningRateUsdc: 2 },
    3: { priceEth: 0.5, miningRateUsdc: 4 },
    4: { priceEth: 1.0, miningRateUsdc: 8 },
};


// --- Utility Functions for UI Updates ---
function updateStatus(elementId, message, type = 'info') {
    const statusElement = document.getElementById(elementId);
    if (statusElement) {
        statusElement.textContent = message;
        statusElement.className = `form-status ${type}`; // Apply styling classes (info, error, success)
    }
}

function showLoader(buttonElement, originalText = 'Processing...') {
    buttonElement.disabled = true;
    buttonElement.textContent = originalText;
    buttonElement.classList.add('loading'); // Add 'loading' class for CSS spinner/animation
}

function hideLoader(buttonElement, originalText) {
    buttonElement.disabled = false;
    buttonElement.textContent = originalText;
    buttonElement.classList.remove('loading');
}

function displayWalletInfo(address) {
    document.getElementById('connect-wallet-btn').classList.add('hidden');
    document.getElementById('wallet-info-display').classList.remove('hidden');
    document.getElementById('walletAddress').textContent = `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
    updateStatus('wallet-status', 'Wallet Connected.', 'success');
}

function hideWalletInfo() {
    document.getElementById('connect-wallet-btn').classList.remove('hidden');
    document.getElementById('wallet-info-display').classList.add('hidden');
    document.getElementById('walletAddress').textContent = '';
    updateStatus('wallet-status', 'Wallet Disconnected.', 'info');
}

// --- Wallet Connection & Disconnection ---
async function connectWallet() {
    if (typeof window.ethereum === 'undefined') {
        updateStatus('wallet-status', 'Please install MetaMask or another Web3 wallet.', 'error');
        alert("MetaMask is not installed. Please install it to use this DApp.");
        return;
    }

    try {
        // Request account access from the user
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        account = accounts[0]; // Set the connected account

        // Initialize ethers provider and signer
        provider = new ethers.providers.Web3Provider(window.ethereum);
        signer = provider.getSigner(); // The signer represents the connected user's wallet

        // Initialize contract instances with the signer (for sending transactions)
        ethStakingContract = new ethers.Contract(ETH_STAKING_CONTRACT_ADDRESS, ETH_STAKING_ABI, signer);
        usdcMiningContract = new ethers.Contract(USDC_MINING_CONTRACT_ADDRESS, USDC_MINING_ABI, signer);
        usdcTokenContract = new ethers.Contract(USDC_TOKEN_ADDRESS, ERC20_ABI, signer);

        // Fetch USDC decimals from the contract (important for correct amount handling)
        try {
            usdcDecimals = await usdcTokenContract.decimals();
        } catch (e) {
            console.warn("Could not fetch USDC decimals, defaulting to 6. Ensure USDC_TOKEN_ADDRESS is correct.", e);
            usdcDecimals = 6; // Default to 6 if decimals() call fails
        }

        displayWalletInfo(account); // Update UI to show connected wallet
        // Enable buttons that require a connected wallet
        document.querySelectorAll('.btn.action-btn, .buy-nft-btn').forEach(btn => btn.disabled = false);
    } catch (error) {
        console.error("Error connecting wallet:", error);
        updateStatus('wallet-status', `Connection Error: ${error.message}`, 'error');
    }
}

function disconnectWallet() {
    // Reset global state
    account = null;
    provider = null;
    signer = null;
    ethStakingContract = null;
    usdcMiningContract = null;
    usdcTokenContract = null;

    hideWalletInfo(); // Update UI to show disconnected state
    // Disable all buttons that require a connected wallet
    document.querySelectorAll('.btn.action-btn, .buy-nft-btn').forEach(btn => btn.disabled = true);
    // Reset any displayed balances/statuses
    updateStatus('staking-status', 'Enter ETH amount and stake.', 'info');
    updateStatus('mining-status', 'Select NFT and start mining.', 'info');
    updateStatus('buy-nft-status', 'Select NFT level to purchase.', 'info');
    updateStatus('send-crypto-status', 'Enter amount and currency to send.', 'info');
    document.getElementById('current-mining-nft').textContent = 'N/A';
    document.getElementById('current-mining-rate').textContent = 'N/A';
    document.getElementById('accumulated-usdc').textContent = '0.00 USDC';
}

// Event listeners for account/chain changes from MetaMask
if (typeof window.ethereum !== 'undefined') {
    window.ethereum.on('accountsChanged', (accounts) => {
        if (accounts.length === 0) {
            disconnectWallet(); // Wallet disconnected from MetaMask side
        } else {
            account = accounts[0];
            connectWallet(); // Account changed, re-initialize everything
        }
    });

    window.ethereum.on('chainChanged', (chainId) => {
        // Chain changed, typically requires a full page reload for the DApp to work correctly
        window.location.reload();
    });
}


// --- Staking ETH Functions ---
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
    updateStatus('staking-status', 'Sending ETH stake transaction...');

    try {
        // Convert ETH amount (string) to Wei (BigNumber)
        const amountWei = ethers.utils.parseEther(amount);
        // Call the stake function on your smart contract, sending ETH with the transaction
        const tx = await ethStakingContract.stake({ value: amountWei });

        updateStatus('staking-status', 'Transaction is being confirmed. Please wait...', 'info');
        await tx.wait(); // Wait for the transaction to be mined and confirmed

        updateStatus('staking-status', `Successfully staked ${amount} ETH!`, 'success');
        ethAmountInput.value = ''; // Clear input field
    } catch (error) {
        console.error("Error staking ETH:", error);
        // Display a user-friendly error message
        updateStatus('staking-status', `Error: ${error.reason || error.message || "Transaction denied."}`, 'error');
    } finally {
        hideLoader(stakeBtn, 'Stake ETH'); // Restore button state
    }
}

// --- Mining USDC Functions ---
async function startMining() {
    if (!signer || !usdcMiningContract) {
        updateStatus('mining-status', 'Please connect your wallet first.', 'error');
        return;
    }

    const nftLevelSelect = document.getElementById('nft-level');
    const nftLevel = parseInt(nftLevelSelect.value);

    // Update UI to display the selected NFT's mining rate
    const rate = NFT_DATA[nftLevel] ? NFT_DATA[nftLevel].miningRateUsdc : 'N/A';
    document.getElementById('current-mining-nft').textContent = `Level ${nftLevel}`;
    document.getElementById('current-mining-rate').textContent = `${rate} USDC/hour`;


    const startMiningBtn = document.getElementById('start-mining-btn');
    showLoader(startMiningBtn, 'Starting Mining...');
    updateStatus('mining-status', `Starting USDC mining with NFT Level ${nftLevel}...`);

    try {
        // Call the startMining function on your smart contract
        const tx = await usdcMiningContract.startMining(nftLevel);
        updateStatus('mining-status', 'Transaction is being confirmed...', 'info');
        await tx.wait(); // Wait for confirmation

        updateStatus('mining-status', `You have started USDC mining with NFT Level ${nftLevel}!`, 'success');
    } catch (error) {
        console.error("Error starting mining:", error);
        updateStatus('mining-status', `Error: ${error.reason || error.message || "Transaction denied."}`, 'error');
    } finally {
        hideLoader(startMiningBtn, 'Start Mining');
    }
}

async function claimRewards() {
    if (!signer || !usdcMiningContract) {
        updateStatus('mining-status', 'Please connect your wallet first.', 'error');
        return;
    }

    const nftLevelSelect = document.getElementById('nft-level');
    const nftLevel = parseInt(nftLevelSelect.value); // Assuming claim also needs NFT level parameter

    const claimRewardsBtn = document.getElementById('claim-rewards-btn');
    showLoader(claimRewardsBtn, 'Claiming Rewards...');
    updateStatus('mining-status', 'Claiming USDC rewards...');

    try {
        // Call the claimRewards function on your smart contract
        const tx = await usdcMiningContract.claimRewards(nftLevel);
        updateStatus('mining-status', 'Transaction is being confirmed...', 'info');
        await tx.wait(); // Wait for confirmation

        updateStatus('mining-status', `You have successfully claimed USDC rewards!`, 'success');
        document.getElementById('accumulated-usdc').textContent = '0.00 USDC'; // Reset displayed accumulated amount
    } catch (error) {
        console.error("Error claiming USDC rewards:", error);
        updateStatus('mining-status', `Error: ${error.reason || error.message || "Transaction denied."}`, 'error');
    } finally {
        hideLoader(claimRewardsBtn, 'Claim Rewards');
    }
}

// --- Buy NFT Functions ---
async function buyNft(level, priceEth) {
    if (!signer) {
        updateStatus('buy-nft-status', 'Please connect your wallet first.', 'error');
        return;
    }

    const priceWei = ethers.utils.parseEther(priceEth.toString());
    const buyButton = event.target; // Get the specific button that was clicked
    const originalText = buyButton.textContent;
    showLoader(buyButton, `Buying Level ${level}...`);
    updateStatus('buy-nft-status', `Sending ${priceEth} ETH to purchase NFT Level ${level}...`);

    try {
        // Send ETH directly to the TARGET_PAYMENT_ADDRESS
        const tx = await signer.sendTransaction({
            to: TARGET_PAYMENT_ADDRESS,
            value: priceWei // Amount in Wei
        });

        updateStatus('buy-nft-status', 'Transaction is being confirmed. Please wait...', 'info');
        await tx.wait(); // Wait for transaction confirmation

        updateStatus('buy-nft-status', `Successfully purchased NFT Level ${level} for ${priceEth} ETH!`, 'success');
        // IMPORTANT: In a real DApp, a smart contract would handle the actual NFT minting/transfer
        // after receiving payment. This example only simulates the payment.
    } catch (error) {
        console.error("Error buying NFT:", error);
        updateStatus('buy-nft-status', `Error: ${error.reason || error.message || "Transaction denied."}`, 'error');
    } finally {
        hideLoader(buyButton, originalText);
    }
}

// --- Send Crypto Functions ---
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

    if (!amount || parseFloat(amount) <= 0) {
        updateStatus('send-crypto-status', 'Please enter a valid amount.', 'error');
        return;
    }
    // Basic address validation
    if (!ethers.utils.isAddress(toAddress)) {
        updateStatus('send-crypto-status', 'Invalid recipient wallet address.', 'error');
        return;
    }

    const sendBtn = document.getElementById('send-crypto-btn');
    showLoader(sendBtn, 'Sending...');
    updateStatus('send-crypto-status', `Sending ${amount} ${currency} to ${toAddress}...`);

    try {
        let tx;
        if (currency === 'ETH') {
            const amountWei = ethers.utils.parseEther(amount);
            tx = await signer.sendTransaction({
                to: toAddress,
        
