"use strict";
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { createConnection, sendMethod } = require('./web3-connection.cjs');
const ABI = require('./contract-abi.json');


function createApp(web3, account, address) {
  const contract = new web3.eth.Contract(ABI, address);
  const balance = () => contract.methods.checkBlance().call({ from: account.address });
  const token = randomBytes(32).toString('hex');
  let sending = false;
  const files = { '/': 'index.html', '/index.html': 'index.html', '/app.js': 'app.js', '/styles.css': 'styles.css', '/vendor/web3.min.js': 'node_modules/web3/dist/web3.min.js' };
  return http.createServer(async (req, res) => {
    const host = `127.0.0.1:${res.socket.localPort}`;
    const json = (code, data) => {
      res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(data));
    };
    if (req.headers.host !== host || (req.headers.origin && req.headers.origin !== `http://${host}`)) return json(403, { error: 'Origin rejected' });
    const url = new URL(req.url, `http://${host}`);
    try {
      if (req.method === 'GET' && files[url.pathname]) {
        const file = files[url.pathname];
        const type = file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html';
        const content = await fs.readFile(path.join(__dirname, file));
        res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8`, 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'" });
        return res.end(content);
      }
      if (req.method === 'GET' && url.pathname === '/api/connect') {
        if (await web3.eth.getChainId() !== 11155111n) throw new Error('Wrong network');
        if (await web3.eth.getCode(address) === '0x') return json(400, { error: 'ไม่พบ Contract บน Sepolia ตรวจ CONTRACT_ADDRESS' });
        return json(200, { account: account.address, contract: address, token });
      }
      if (req.method === 'GET' && url.pathname === '/api/balance') return json(200, { balance: (await balance()).toString() });
      if (req.method === 'GET' && url.pathname === '/api/receipt') {
        const hash = url.searchParams.get('hash');
        if (!/^0x[0-9a-fA-F]{64}$/.test(hash || '')) return json(400, { error: 'Invalid hash' });
        const receipt = await web3.eth.getTransactionReceipt(hash);
        return json(200, { status: receipt ? Number(receipt.status) : null });
      }
      if (req.method === 'POST' && url.pathname === '/api/transaction') {
        if (req.headers['x-csrf-token'] !== token || req.headers['content-type'] !== 'application/json') return json(403, { error: 'Request rejected' });
        if (sending) return json(409, { error: 'กำลังส่งธุรกรรม กรุณารอ' });
        sending = true;
        try {
          let body = '';
          for await (const chunk of req) { body += chunk; if (body.length > 2048) return json(413, { error: 'Request too large' }); }
          let data;
          try { data = JSON.parse(body); } catch { return json(400, { error: 'Invalid JSON' }); }
          if (!data || !['deposit', 'withdraw'].includes(data.operation) || typeof data.amount !== 'string' || !/^[1-9][0-9]{0,77}$/.test(data.amount) || BigInt(data.amount) >= 2n ** 256n) return json(400, { error: 'จำนวนเงินหรือคำสั่งไม่ถูกต้อง' });
          const amount = BigInt(data.amount);
          if (data.operation === 'withdraw' && amount > await balance()) return json(400, { error: 'ยอดเงินฝากไม่พอ' });
          const method = data.operation === 'deposit' ? contract.methods.deposit() : contract.methods.withdraw(amount);
          const hash = await sendMethod(method, { from: account.address, ...(data.operation === 'deposit' ? { value: amount } : {}) });
          return json(200, { hash });
        } finally { sending = false; }
      }
      json(404, { error: 'Not found' });
    } catch (error) {
      // Provider errors may contain credentials in their URLs; never return them.
      const messages = { INSUFFICIENT_FUNDS: 'Sepolia ETH ไม่พอสำหรับรายการและค่าธรรมเนียม', CALL_EXCEPTION: 'Contract ปฏิเสธรายการ ตรวจยอดเงินและ Address' };
      json(502, { error: messages[error.code] || 'ติดต่อ Infura หรือทำรายการไม่สำเร็จ ตรวจการตั้งค่าและตรวจ Etherscan ก่อนส่งซ้ำ' });
    }
  });
}

if (require.main === module) {
  try {
    const { web3, account } = createConnection();
    const address = process.env.CONTRACT_ADDRESS;
    if (!web3.utils.isAddress(address) || /^0x0{40}$/i.test(address)) throw new Error();
    createApp(web3, account, address).listen(8000, '127.0.0.1', () => console.log('Bank Web3.js: http://127.0.0.1:8000'));

  } catch {
    console.error('ตั้งค่า INFURA_URL, PRIVATE_KEY และ CONTRACT_ADDRESS ใน .env ให้ถูกต้อง');
    process.exitCode = 1;
  }
}
module.exports = { createApp };
