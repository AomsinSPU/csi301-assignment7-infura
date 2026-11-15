const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../server.cjs');
const { Web3 } = require('web3');
const ganache = require('ganache');
const { compile } = require('../compile.cjs');
test('Web3.js HTTP signing: deploy, deposit, withdraw, balances and request isolation', async () => {
  const chain = ganache.server({ logging: { quiet: true }, chain: { chainId: 11155111 }, wallet: { totalAccounts: 2 } });
  await chain.listen(0, '127.0.0.1');
  const web3 = new Web3(new Web3.providers.HttpProvider(`http://127.0.0.1:${chain.address().port}`));
  const key = Object.values(chain.provider.getInitialAccounts())[0].secretKey;
  const account = web3.eth.accounts.privateKeyToAccount(key);
  web3.eth.accounts.wallet.add(account);
  const artifact = compile();
  const deployment = new web3.eth.Contract(artifact.abi).deploy({ data: '0x' + artifact.evm.bytecode.object });
  const gas = await deployment.estimateGas({ from: account.address });
  const contract = await deployment.send({ from: account.address, gas: (gas * 120n / 100n).toString() });
  const address = contract.options.address;
  await contract.methods.deposit().send({ from: account.address, value: '100', gas: '100000' });
  const server = createApp(web3, account, address);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const info = await (await fetch(base + '/api/connect')).json();
    assert.equal(info.account, account.address);
    assert.equal((await fetch(base + "/vendor/web3.min.js")).status, 200);
    assert.equal((await (await fetch(base + '/api/balance')).json()).balance, '100');
    for (const file of ['/.env', '/server.cjs', '/.git/config']) assert.equal((await fetch(base + file)).status, 404);
    assert.equal((await fetch(base + '/api/connect', { headers: { Origin: 'https://evil.example' } })).status, 403);
    const post = (data, token = info.token) => fetch(base + '/api/transaction', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token }, body: JSON.stringify(data) });
    assert.equal((await post({ operation: 'deposit', amount: '1' }, 'wrong')).status, 403);
    for (const amount of ['0', '-1', '1.1', '1e3']) assert.equal((await post({ operation: 'deposit', amount })).status, 400);
    assert.equal((await post({ operation: 'withdraw', amount: '101' })).status, 400);
    for (const [operation, amount, expected] of [['deposit', '10', '110'], ['withdraw', '50', '60']]) {
      const response = await post({ operation, amount });
      assert.equal(response.status, 200);
      const { hash } = await response.json();
      let receipt;
      for (let i = 0; i < 100; i++) {
        receipt = await (await fetch(base + '/api/receipt?hash=' + hash)).json();
        if (receipt.status !== null) break;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      assert.equal(receipt.status, 1);
      assert.equal((await (await fetch(base + '/api/balance')).json()).balance, expected);
    }
    const other = Object.keys(chain.provider.getInitialAccounts())[1];
    assert.equal(await contract.methods.checkBlance().call({ from: other }), 0n);
    web3.eth.getChainId = async () => { throw new Error('secret-api-key'); };
    assert.ok(!(await (await fetch(base + '/api/connect')).text()).includes('secret-api-key'));
  } finally { await new Promise(resolve => server.close(resolve)); await chain.close(); }
});
