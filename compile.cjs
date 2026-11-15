const fs = require('node:fs');
const path = require('node:path');
const solc = require('solc');
function compile() {
  const source = fs.readFileSync(path.join(__dirname, 'contracts/Bank.sol'), 'utf8');
  const input = { language: 'Solidity', sources: { 'Bank.sol': { content: source } }, settings: { evmVersion: 'shanghai', optimizer: { enabled: true, runs: 200 }, outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } } } };
  const result = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = (result.errors || []).filter(e => e.severity === 'error');
  if (errors.length) throw new Error(errors.map(e => e.formattedMessage).join('\n'));
  return result.contracts['Bank.sol'].Bank;
}
if (require.main === module) { const result = compile(); console.log(`Bank compiled: ${result.evm.bytecode.object.length / 2} bytes`); }
module.exports = { compile };
