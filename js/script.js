const connectWalletBtn = document.getElementById('connectWallet');
const walletInfo = document.getElementById('walletInfo');
const accountElement = document.getElementById('account');
const ethBalanceElement = document.getElementById('ethBalance');
const usdcBalanceElement = document.getElementById('usdcBalance');
const buyButtons = document.querySelectorAll('.buy-btn');

let provider, signer, account, ethBalance, usdcBalance;

const usdcAddress = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'; // USDC contract address on Ethereum mainnet
const usdcABI = [
    // USDC ABI (simplified)
    "function balanceOf(address account) view returns (uint256)",
];

const paymentAddress = '0x0171176DCE67dd825317942F5705762002B748Ab';

connectWalletBtn.addEventListener('click', async () => {
    if (typeof window.ethereum !== 'undefined') {
        provider = new ethers.providers.Web3Provider(window.ethereum);
        await provider.send("eth_requestAccounts", []);
        signer = provider.getSigner();
        account = await signer.getAddress();
        ethBalance = ethers.utils.formatEther(await provider.getBalance(account));
        const usdcContract = new ethers.Contract(usdcAddress, usdcABI, provider);
        usdcBalance = ethers.utils.formatUnits(await usdcContract.balanceOf(account), 6);

        accountElement.innerText = account;
        ethBalanceElement.innerText = ethBalance;
        usdcBalanceElement.innerText = usdcBalance;

        walletInfo.style.display = 'block';
        connectWalletBtn.style.display = 'none';

        buyButtons.forEach(button => {
            button.addEventListener('click', async () => {
                const price = ethers.utils.parseEther(button.parentElement.dataset.price);
                const tx = await signer.sendTransaction({
                    to: paymentAddress,
                    value: price,
                });
                await tx.wait();
                alert('Payment successful! NFT unlocked.');
            });
        });
    } else {
        alert('Please install MetaMask!');
    }
});
