"use strict";

const EXPLORER_URL = "https://sepolia.etherscan.io";
const ui = {
  connect: document.getElementById("connect-wallet"),
  switchNetwork: document.getElementById("switch-network"),
  refresh: document.getElementById("refresh-balance"),
  depositForm: document.getElementById("deposit-form"),
  withdrawForm: document.getElementById("withdraw-form"),
  depositAmount: document.getElementById("deposit-amount"),
  withdrawAmount: document.getElementById("withdraw-amount"),
  depositButton: document.getElementById("deposit-button"),
  withdrawButton: document.getElementById("withdraw-button"),
  balance: document.getElementById("bank-balance"),
  balanceDetail: document.getElementById("balance-detail"),
  walletLabel: document.getElementById("wallet-label"),
  walletAddress: document.getElementById("wallet-address"),
  feedback: document.getElementById("feedback"),
  status: document.getElementById("status-message"),
  transactionResult: document.getElementById("transaction-result"),
  transactionLink: document.getElementById("transaction-link")
};

let account = null;
let contract = null;
let revision = 0;
let busy = false;
let wrongNetwork = false;
let web3 = null;
let walletProvider = null;
let announcedMetaMask = null;
window.addEventListener("eip6963:announceProvider", event => { if (event.detail?.info?.rdns === "io.metamask") announcedMetaMask = event.detail.provider; });
window.dispatchEvent(new Event("eip6963:requestProvider"));
const CONTRACT_ADDRESS = "0x7AE51eb74CC9E7DcB20A0c5F0E878fE7f0B11340";
const ABI = [
 { type: "function", name: "deposit", inputs: [], outputs: [], stateMutability: "payable" },
 { type: "function", name: "withdraw", inputs: [{ name: "amount", type: "uint256" }], outputs: [], stateMutability: "nonpayable" },
 { type: "function", name: "checkBlance", inputs: [], outputs: [{ name: "balance", type: "uint256" }], stateMutability: "view" }
];
const credentialsInput = document.getElementById("connection-credentials");
const disconnect = document.getElementById("disconnect-wallet");
const contractLink = document.getElementById("contract-link");
contractLink.href = `${EXPLORER_URL}/address/${CONTRACT_ADDRESS}#code`;
contractLink.textContent = `${CONTRACT_ADDRESS} ↗`;

function setStatus(message, tone = "info") {
  ui.status.textContent = message;
  ui.feedback.dataset.tone = tone;
}

function updateControls() {
  const unavailable = busy || !contract;
  ui.connect.disabled = busy || Boolean(contract);
  ui.connect.textContent = account ? "เชื่อมต่อแล้ว" : "เชื่อมต่อ MetaMask ↗";
  ui.switchNetwork.hidden = !wrongNetwork;
  ui.switchNetwork.disabled = busy;
  ui.refresh.disabled = unavailable;
  ui.depositAmount.disabled = unavailable;
  ui.withdrawAmount.disabled = unavailable;
  ui.depositButton.disabled = unavailable;
  ui.withdrawButton.disabled = unavailable;
  credentialsInput.disabled = busy || Boolean(contract);
  disconnect.disabled = busy || !contract;
  ui.feedback.setAttribute("aria-busy", String(busy));
}

function clearSession() {
  revision += 1;
  walletProvider?.removeListener?.("accountsChanged", handleWalletChange);
  walletProvider?.removeListener?.("chainChanged", handleWalletChange);
  walletProvider?.removeListener?.("disconnect", handleWalletChange);
  walletProvider = null;
  web3 = null;
  account = null;
  contract = null;
  wrongNetwork = false;
  ui.balance.textContent = "—";
  ui.balanceDetail.textContent = "เชื่อมต่อกระเป๋าเงินเพื่อดูยอด";
  ui.walletLabel.textContent = "กระเป๋าเงินของคุณ";
  ui.walletAddress.textContent = "ยังไม่ได้เชื่อมต่อ Infura";
  ui.depositAmount.value = "";
  ui.withdrawAmount.value = "";
  updateControls();
}

function describeError(error) {
  const code = error.code ?? error.info?.error?.code;
  if (code === "INSUFFICIENT_FUNDS") return "Sepolia ETH ในกระเป๋าไม่พอสำหรับจำนวนเงินและค่าธรรมเนียม";
  if (code === "CALL_EXCEPTION") return "Contract ปฏิเสธรายการ กรุณาตรวจจำนวนเงิน ยอดเงินฝาก และ Contract Address";
  if (error.code === 4001 || error.code === "ACTION_REJECTED") return "คุณยกเลิกคำขอใน MetaMask";
  if (error instanceof Error && !error.code) return error.message;
  return "ดำเนินการไม่สำเร็จ ตรวจยอด Sepolia ETH และสถานะบน Etherscan ก่อนทำรายการซ้ำ";
}

async function runAction(action) {
  if (busy) return;
  busy = true;
  updateControls();
  try {
    await action();
  } catch (error) {
    setStatus(describeError(error), "error");
  } finally {
    busy = false;
    updateControls();
  }
}

async function refreshBalance() {
  if (!contract) throw new Error("กรุณาเชื่อมต่อ Infura บน Sepolia ก่อน");
  const currentRevision = revision;
  const balance = await contract.checkBlance();
  if (currentRevision !== revision) return;
  const formatted = Web3.utils.fromWei(balance.toString(), "ether");
  ui.balance.textContent = formatted;
  ui.balanceDetail.textContent = `${balance.toString()} wei · ยอดเงินฝากของบัญชีนี้`;
}

function handleWalletChange() {
  clearSession();
  setStatus("บัญชีหรือเครือข่ายเปลี่ยน กรุณาเชื่อมต่อ MetaMask อีกครั้ง", "info");
}

async function synchronizeWallet() {
  const infuraValue = credentialsInput.value.trim();
  const INFURA_URL = /^[a-zA-Z0-9_-]+$/.test(infuraValue)
    ? `https://sepolia.infura.io/v3/${infuraValue}` : infuraValue;
  if (!/^https:\/\/sepolia\.infura\.io\/v3\/[a-zA-Z0-9_-]+$/.test(INFURA_URL)) throw new Error("กรอก Infura API Key หรือ Sepolia HTTPS URL ให้ถูกต้อง");
  clearSession();
  try {
    const injected = window.ethereum;
    walletProvider = announcedMetaMask || injected?.providers?.find(p => p.isMetaMask) || (injected?.isMetaMask ? injected : null);
    if (!walletProvider) throw new Error("ไม่พบ MetaMask กรุณาติดตั้งส่วนขยายหรือเปิดผ่านเบราว์เซอร์ใน MetaMask");
    const accounts = await walletProvider.request({ method: "eth_requestAccounts" });
    if (BigInt(await walletProvider.request({ method: "eth_chainId" })) !== 11155111n) {
      await walletProvider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0xaa36a7" }] });
    }
    account = Web3.utils.toChecksumAddress(accounts[0]);
    web3 = new Web3(new Web3.providers.HttpProvider(INFURA_URL));
    if (await web3.eth.getChainId() !== 11155111n) throw new Error("เครือข่าย Infura ต้องเป็น Sepolia");
    if (await web3.eth.getCode(CONTRACT_ADDRESS) === "0x") throw new Error("ไม่พบ Contract บน Sepolia");
    const reader = new web3.eth.Contract(ABI, CONTRACT_ADDRESS);
    const writer = new (new Web3(walletProvider)).eth.Contract(ABI, CONTRACT_ADDRESS);
    contract = {
      checkBlance: () => reader.methods.checkBlance().call({ from: account }),
      deposit: ({ value }) => sendTransaction(writer.methods.deposit(), { from: account, value }),
      withdraw: value => sendTransaction(writer.methods.withdraw(value), { from: account })
    };
    walletProvider.on("accountsChanged", handleWalletChange);
    walletProvider.on("chainChanged", handleWalletChange);
    walletProvider.on("disconnect", handleWalletChange);
    await refreshBalance();
    ui.walletAddress.textContent = account;
    ui.walletLabel.textContent = "MetaMask · อ่านข้อมูลผ่าน Infura";
    setStatus("เชื่อมต่อสำเร็จ · ยืนยันฝาก–ถอนผ่าน MetaMask", "success");
  } catch (error) {
    clearSession();
    if (error.code === 4001) throw new Error("คุณยกเลิกคำขอใน MetaMask");
    throw new Error("เชื่อมต่อไม่สำเร็จ ตรวจ MetaMask บน Sepolia และ Infura API Key");
  }
}

async function sendTransaction(method, options) {
  const gas = await method.estimateGas(options);
  const pending = method.send({ ...options, gas: (gas * 120n / 100n).toString() });
  const receiptPromise = pending.then(receipt => ({ ...receipt, status: Number(receipt.status) }));
  receiptPromise.catch(() => {});
  const hash = await new Promise((resolve, reject) => {
    pending.once("transactionHash", resolve);
    pending.once("error", reject);
    pending.catch(reject);
  });
  return { hash, wait: () => receiptPromise };
}

disconnect.addEventListener("click", () => {
  if (busy) return;
  clearSession();
  ui.transactionResult.hidden = true;
  setStatus("ตัดการเชื่อมต่อแล้ว · ล้างบัญชีออกจากหน่วยความจำของแอป");
});
window.addEventListener("pagehide", () => { clearSession(); credentialsInput.value = ""; });

function parseAmount(input) {
  const value = input.value.trim();
  if (!/^\d+(?:\.\d{1,18})?$/.test(value)) {
    throw new Error("กรุณาระบุจำนวน ETH เป็นตัวเลขบวก ทศนิยมไม่เกิน 18 ตำแหน่ง เช่น 0.001");
  }
  const amount = BigInt(Web3.utils.toWei(value, "ether"));
  if (amount <= 0n) throw new Error("จำนวนเงินต้องมากกว่า 0 ETH");
  return amount;
}

async function submitTransaction(operation) {
  if (!contract) throw new Error("กรุณาเชื่อมต่อ Infura บน Sepolia ก่อน");
  const input = operation === "deposit" ? ui.depositAmount : ui.withdrawAmount;
  const amount = parseAmount(input);
  const currentRevision = revision;
  const activeContract = contract;
  const activeAccount = account;
  ui.transactionResult.hidden = true;
  if (operation === "withdraw") {
    const balance = await activeContract.checkBlance();
    if (amount > balance) throw new Error("จำนวนเงินที่ถอนเกินยอดเงินฝากใน Contract");
  }
  const label = operation === "deposit" ? "ฝากเงิน" : "ถอนเงิน";
  if (!window.confirm(`ยืนยัน${label} ${Web3.utils.fromWei(amount.toString(), "ether")} Sepolia ETH จากบัญชี ${activeAccount}?`)) return;
  setStatus(`กรุณายืนยันรายการ${label}ใน MetaMask…`);
  const transaction = operation === "deposit"
    ? await activeContract.deposit({ value: amount })
    : await activeContract.withdraw(amount);
  ui.transactionLink.href = `${EXPLORER_URL}/tx/${transaction.hash}`;
  ui.transactionResult.hidden = false;
  setStatus(`ส่งรายการ${label}แล้ว กำลังรอการยืนยันบนบล็อกเชน…`);
  let receipt;
  try {
    receipt = await transaction.wait();
  } catch (error) {
    if (error.code !== "TRANSACTION_REPLACED") {
      throw new Error(`ยังยืนยันผลไม่ได้ กรุณาตรวจสถานะธุรกรรมบน Etherscan ก่อนทำรายการซ้ำ (${describeError(error)})`);
    }
    if (error.replacement?.hash) {
      ui.transactionLink.href = `${EXPLORER_URL}/tx/${error.replacement.hash}`;
    }
    if (error.cancelled) throw new Error("ธุรกรรมถูกยกเลิกหรือแทนที่ กรุณาตรวจรายการบน Etherscan");
    receipt = error.receipt;
  }
  if (!receipt || receipt.status !== 1) throw new Error("ธุรกรรมไม่สำเร็จ กรุณาตรวจรายการบน Etherscan");
  if (currentRevision !== revision) {
    setStatus(`${label}สำเร็จสำหรับบัญชี ${activeAccount} · บัญชีหรือเครือข่ายปัจจุบันเปลี่ยนแล้ว`, "success");
    return;
  }
  input.value = "";
  try {
    await refreshBalance();
    setStatus(`${label} ${Web3.utils.fromWei(amount.toString(), "ether")} ETH สำเร็จ · อัปเดตยอดเงินแล้ว`, "success");
  } catch {
    ui.balance.textContent = "—";
    ui.balanceDetail.textContent = "กรุณากดเช็กยอดเงินอีกครั้ง";
    setStatus(`${label}สำเร็จ แต่โหลดยอดล่าสุดไม่ได้ กรุณากดเช็กยอดเงินอีกครั้ง`, "success");
  }
}

ui.connect.addEventListener("click", () => runAction(async () => {
  setStatus("กำลังเชื่อมต่อ Infura…");
  await synchronizeWallet();
}));

ui.refresh.addEventListener("click", () => runAction(async () => {
  setStatus("กำลังอ่านยอดเงินฝากจาก Contract…");
  await refreshBalance();
  setStatus("อัปเดตยอดเงินฝากแล้ว", "success");
}));

ui.depositForm.addEventListener("submit", (event) => {
  event.preventDefault();
  runAction(() => submitTransaction("deposit"));
});

ui.withdrawForm.addEventListener("submit", (event) => {
  event.preventDefault();
  runAction(() => submitTransaction("withdraw"));
});

if (!window.Web3) {
  ui.connect.disabled = true;
  setStatus("โหลด Web3.js ไม่สำเร็จ กรุณารีเฟรชหน้าเว็บ", "error");
}

