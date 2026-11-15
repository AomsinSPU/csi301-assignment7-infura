const { Web3 } = require('web3');

function createConnection(env = process.env) {
  const INFURA_URL = env.INFURA_URL;
  const PRIVATE_KEY = env.PRIVATE_KEY;
  if (!/^https:\/\/sepolia\.infura\.io\/v3\/[a-zA-Z0-9_-]+$/.test(INFURA_URL || '') || INFURA_URL.includes('YOUR_')) throw new Error('Invalid INFURA_URL');
  // Blueprint pages 3 and 5: Provider -> Account -> Wallet.
  const web3 = new Web3(new Web3.providers.HttpProvider(INFURA_URL));
  const account = web3.eth.accounts.privateKeyToAccount(PRIVATE_KEY);
  web3.eth.accounts.wallet.add(account);
  return { web3, account };
}

async function sendMethod(method, options) {
  const estimated = await method.estimateGas(options);
  const pending = method.send({ ...options, gas: (estimated * 120n / 100n).toString() });
  // Return the hash promptly; the browser polls for the receipt.
  return new Promise((resolve, reject) => {
    pending.once('transactionHash', resolve);
    pending.once('error', reject);
    pending.catch(reject);
  });
}
module.exports = { createConnection, sendMethod };
