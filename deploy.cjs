const fs = require('node:fs');
const path = require('node:path');
const { createConnection } = require('./web3-connection.cjs');
const { compile } = require('./compile.cjs');
async function main() {
  const artifact = compile();
  const { web3, account } = createConnection();
  if (await web3.eth.getChainId() !== 11155111n) throw new Error('Wrong network');
  const deployment = new web3.eth.Contract(artifact.abi).deploy({ data: '0x' + artifact.evm.bytecode.object });
  const gas = await deployment.estimateGas({ from: account.address });
  console.log(`Deploy Bank to Sepolia from ${account.address}`);
  const contract = await deployment.send({ from: account.address, gas: (gas * 120n / 100n).toString() }).on('transactionHash', hash => console.log(`https://sepolia.etherscan.io/tx/${hash}`));
  const address = contract.options.address;
  fs.writeFileSync(path.join(__dirname, 'deployment.json'), JSON.stringify({ chainId: 11155111, address }, null, 2));
  console.log(`Deploy สำเร็จ นำบรรทัดนี้ใส่ใน .env:\nCONTRACT_ADDRESS=${address}`);
}
main().catch(() => { console.error('Deploy ไม่สำเร็จ ตรวจ .env, Sepolia ETH และสถานะธุรกรรมบน Etherscan ก่อนลองใหม่'); process.exitCode = 1; });
