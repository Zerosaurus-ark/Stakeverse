// --- Web3 Global Variables ---
let provider;
let signer;
let account;

// Contract Instances (Placeholders - REPLACE with your actual ABIs and Addresses)
const ETH_STAKING_CONTRACT_ADDRESS = "0xYourEthStakingContractAddress"; // Địa chỉ hợp đồng Staking ETH của bạn
const USDC_MINING_CONTRACT_ADDRESS = "0xYourUsdcMiningContractAddress"; // Địa chỉ hợp đồng Mining USDC của bạn
const USDC_TOKEN_ADDRESS = "0xYourUsdcTokenAddress"; // Địa chỉ hợp đồng token USDC (thường là 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48 trên Ethereum mainnet, nhưng hãy kiểm tra testnet của bạn)

// Minimal ABI for ETH Staking (replace with full ABI of your contract)
const ETH_STAKING_ABI = [
    "function stake() payable",
    "function withdrawTreasury()", // Example: owner only
    "function getStakedAmount(address user) view returns (uint256)", // Example: if you have this
    "event Staked(address indexed user, uint256 amount, uint256 timestamp)"
];

// Minimal ABI for USDC Mining (replace with full ABI of your contract)
const USDC_MINING_ABI = [
    "function startMining(uint256 nftLevel)",
    "function claimRewards(uint256 nftLevel)",
    "function getMiningData(address user) view returns (uint256 lastClaimTime, uint256 currentRate)", // Example: if you have this
    "function withdrawUsdc()", // Example: owner only
    "event MiningStarted(address indexed user, uint256 nftLevel)",
    "event RewardsClaimed(address indexed user, uint256 amount)"
];

// Minimal ABI for ERC20 (USDC)
const ERC20_ABI = [
    "function transfer(address to, uint256 amount) returns (bool)",
    "function balanceOf(address account) view returns (uint256)",
    "function decimals() view returns (uint8)"
];

let ethStakingContract;
let usdcMiningContract;
let usdcTokenContract;
let usdcDecimals = 6; // Most USDC tokens use 6 decimals, but confirm for your testnet/mainnet


// --- Utility Functions for UI Updates ---
function updateStatus(elementId, message, type = 'info') {
    const statusElement = document.getElementById(elementId);
    if (statusElement) {
        statusElement.textContent = message;
        statusElement.className = `form-status ${type}`; // Add styling class
    }
}

function showLoader(buttonElement) {
    buttonElement.disabled = true;
    buttonElement.textContent = 'Đang xử lý...'; // Example, could add spinner
}

function hideLoader(buttonElement, originalText) {
    buttonElement.disabled = false;
    buttonElement.textContent = originalText;
}

// --- Wallet Connection ---
async function connectWallet() {
    if (typeof window.ethereum === 'undefined') {
        updateStatus('wallet-status', 'Vui lòng cài đặt MetaMask hoặc ví Web3 khác.', 'error');
        alert("MetaMask is not installed. Please install it to use this DApp.");
        return;
    }

    try {
        // Request account access
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        account = accounts[0];

        // Initialize ethers provider and signer
        provider = new ethers.providers.Web3Provider(window.ethereum);
        signer = provider.getSigner();

        // Initialize contract instances with signer (for writing to blockchain)
        ethStakingContract = new ethers.Contract(ETH_STAKING_CONTRACT_ADDRESS, ETH_STAKING_ABI, signer);
        usdcMiningContract = new ethers.Contract(USDC_MINING_CONTRACT_ADDRESS, USDC_MINING_ABI, signer);
        usdcTokenContract = new ethers.Contract(USDC_TOKEN_ADDRESS, ERC20_ABI, signer);

        // Fetch USDC decimals (important for correct amount handling)
        try {
            usdcDecimals = await usdcTokenContract.decimals();
        } catch (e) {
            console.warn("Could not fetch USDC decimals, defaulting to 6.", e);
            usdcDecimals = 6;
        }

        updateStatus('wallet-status', `Đã kết nối: ${account.substring(0, 6)}...${account.substring(account.length - 4)}`, 'success');
        document.getElementById('connect-wallet-btn').textContent = "Đã Kết Nối";
        document.getElementById('connect-wallet-btn').disabled = true;
        // Optionally, show disconnect button or user info
    } catch (error) {
        console.error("Lỗi khi kết nối ví:", error);
        updateStatus('wallet-status', `Lỗi kết nối: ${error.message}`, 'error');
    }
}

// Event listeners for account/chain changes
if (typeof window.ethereum !== 'undefined') {
    window.ethereum.on('accountsChanged', (accounts) => {
        if (accounts.length === 0) {
            // User disconnected their account
            account = null;
            provider = null;
            signer = null;
            ethStakingContract = null;
            usdcMiningContract = null;
            usdcTokenContract = null;
            updateStatus('wallet-status', 'Đã ngắt kết nối.', 'info');
            document.getElementById('connect-wallet-btn').textContent = "Kết nối ví";
            document.getElementById('connect-wallet-btn').disabled = false;
        } else {
            // Account changed, re-initialize
            account = accounts[0];
            connectWallet(); // Re-run connect to update everything
        }
    });

    window.ethereum.on('chainChanged', (chainId) => {
        // Chain changed, reload page or re-initialize
        window.location.reload(); // Simple reload for now
    });
}


// --- Staking ETH Functions ---
async function stakeEth() {
    if (!signer || !ethStakingContract) {
        updateStatus('staking-status', 'Vui lòng kết nối ví trước.', 'error');
        return;
    }

    const ethAmountInput = document.getElementById('eth-amount');
    const amount = ethAmountInput.value;
    if (!amount || parseFloat(amount) <= 0) {
        updateStatus('staking-status', 'Vui lòng nhập số ETH hợp lệ.', 'error');
        return;
    }

    const stakeBtn = document.getElementById('stake-eth-btn');
    showLoader(stakeBtn);
    updateStatus('staking-status', 'Đang gửi giao dịch stake ETH...');

    try {
        // Convert ETH amount to Wei (smallest unit)
        const amountWei = ethers.utils.parseEther(amount);
        const tx = await ethStakingContract.stake({ value: amountWei });

        updateStatus('staking-status', 'Giao dịch đang được xác nhận. Vui lòng chờ...', 'info');
        await tx.wait(); // Wait for the transaction to be mined

        updateStatus('staking-status', `Bạn đã stake thành công ${amount} ETH!`, 'success');
        ethAmountInput.value = ''; // Clear input
        // Optionally, refresh staked balance display
    } catch (error) {
        console.error("Lỗi khi stake ETH:", error);
        updateStatus('staking-status', `Lỗi: ${error.reason || error.message || "Giao dịch bị từ chối."}`, 'error');
    } finally {
        hideLoader(stakeBtn, 'Stake ETH');
    }
}

// --- Mining USDC Functions ---
async function startMining() {
    if (!signer || !usdcMiningContract) {
        updateStatus('mining-status', 'Vui lòng kết nối ví trước.', 'error');
        return;
    }

    const nftLevelSelect = document.getElementById('nft-level');
    const nftLevel = parseInt(nftLevelSelect.value);

    const startMiningBtn = document.getElementById('start-mining-btn');
    showLoader(startMiningBtn);
    updateStatus('mining-status', `Đang bắt đầu đào với NFT Level ${nftLevel}...`);

    try {
        // Assuming your contract has a startMining(uint256 nftLevel) function
        const tx = await usdcMiningContract.startMining(nftLevel);
        updateStatus('mining-status', 'Giao dịch đang được xác nhận...', 'info');
        await tx.wait();

        updateStatus('mining-status', `Bạn đã bắt đầu đào USDC với NFT Level ${nftLevel}!`, 'success');
        // Optionally, update mining status display
    } catch (error) {
        console.error("Lỗi khi bắt đầu đào:", error);
        updateStatus('mining-status', `Lỗi: ${error.reason || error.message || "Giao dịch bị từ chối."}`, 'error');
    } finally {
        hideLoader(startMiningBtn, 'Bắt đầu đào');
    }
}

async function claimRewards() {
    if (!signer || !usdcMiningContract) {
        updateStatus('mining-status', 'Vui lòng kết nối ví trước.', 'error');
        return;
    }

    const nftLevelSelect = document.getElementById('nft-level');
    const nftLevel = parseInt(nftLevelSelect.value); // Assuming claim also needs NFT level

    const claimRewardsBtn = document.getElementById('claim-rewards-btn');
    showLoader(claimRewardsBtn);
    updateStatus('mining-status', 'Đang rút thưởng USDC...');

    try {
        // Assuming your contract has a claimRewards(uint256 nftLevel) function
        const tx = await usdcMiningContract.claimRewards(nftLevel);
        updateStatus('mining-status', 'Giao dịch đang được xác nhận...', 'info');
        await tx.wait();

        updateStatus('mining-status', `Bạn đã rút thưởng USDC thành công!`, 'success');
        // Optionally, update claimed amount display
    } catch (error) {
        console.error("Lỗi khi rút thưởng USDC:", error);
        updateStatus('mining-status', `Lỗi: ${error.reason || error.message || "Giao dịch bị từ chối."}`, 'error');
    } finally {
        hideLoader(claimRewardsBtn, 'Rút thưởng');
    }
}


// --- Withdrawal Functions (for platform owner/treasury) ---
async function withdrawEth() {
    if (!signer || !ethStakingContract) {
        updateStatus('withdraw-status', 'Vui lòng kết nối ví trước.', 'error');
        return;
    }
    // This function assumes `withdrawTreasury()` is callable only by the owner/treasury address
    // Make sure your smart contract has access control for this function.

    const withdrawEthBtn = document.getElementById('withdraw-eth-btn');
    showLoader(withdrawEthBtn);
    updateStatus('withdraw-status', 'Đang rút toàn bộ ETH từ hợp đồng...');

    try {
        const tx = await ethStakingContract.withdrawTreasury();
        updateStatus('withdraw-status', 'Giao dịch đang được xác nhận...', 'info');
        await tx.wait();

        updateStatus('withdraw-status', `Đã rút toàn bộ ETH về ví treasury thành công!`, 'success');
    } catch (error) {
        console.error("Lỗi khi rút ETH từ treasury:", error);
        updateStatus('withdraw-status', `Lỗi: ${error.reason || error.message || "Giao dịch bị từ chối (có thể bạn không phải chủ sở hữu)."}`, 'error');
    } finally {
        hideLoader(withdrawEthBtn, 'Rút ETH');
    }
}

async function withdrawUsdc() {
    if (!signer || !usdcMiningContract || !usdcTokenContract) {
        updateStatus('withdraw-status', 'Vui lòng kết nối ví trước.', 'error');
        return;
    }
    // This function assumes `withdrawUsdc()` is callable only by the owner/treasury address
    // Make sure your smart contract has access control for this function.

    const withdrawUsdcBtn = document.getElementById('withdraw-usdc-btn');
    showLoader(withdrawUsdcBtn);
    updateStatus('withdraw-status', 'Đang rút toàn bộ USDC từ hợp đồng...');

    try {
        const tx = await usdcMiningContract.withdrawUsdc(); // Call the withdraw function on the mining contract
        updateStatus('withdraw-status', 'Giao dịch đang được xác nhận...', 'info');
        await tx.wait();

        updateStatus('withdraw-status', `Đã rút toàn bộ USDC về ví treasury thành công!`, 'success');
    } catch (error) {
        console.error("Lỗi khi rút USDC từ treasury:", error);
        updateStatus('withdraw-status', `Lỗi: ${error.reason || error.message || "Giao dịch bị từ chối (có thể bạn không phải chủ sở hữu)."}`, 'error');
    } finally {
        hideLoader(withdrawUsdcBtn, 'Rút USDC');
    }
}


// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
    // Check if MetaMask is already connected on page load
    if (window.ethereum && window.ethereum.selectedAddress) {
        connectWallet();
    }

    document.getElementById('connect-wallet-btn').addEventListener('click', connectWallet);
    document.getElementById('stake-eth-btn').addEventListener('click', stakeEth);
    document.getElementById('start-mining-btn').addEventListener('click', startMining);
    document.getElementById('claim-rewards-btn').addEventListener('click', claimRewards);
    document.getElementById('withdraw-eth-btn').addEventListener('click', withdrawEth);
    document.getElementById('withdraw-usdc-btn').addEventListener('click', withdrawUsdc);

    // Optional: add some initial UI display updates
    updateStatus('wallet-status', 'Chưa kết nối ví.', 'info');
    updateStatus('staking-status', 'Nhập số ETH và stake.', 'info');
    updateStatus('mining-status', 'Chọn NFT và bắt đầu đào.', 'info');
    updateStatus('withdraw-status', 'Chức năng rút tiền cho quản trị viên.', 'info');
});
