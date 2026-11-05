// GASのソース(src/*.js)を1つのグローバル空間に読み込む（GASと同じくファイル順に評価）
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadGas(globals) {
  const ctx = vm.createContext(Object.assign({ console }, globals || {}));
  const dir = path.join(__dirname, '..', 'src');
  fs.readdirSync(dir).filter((f) => f.endsWith('.js')).sort().forEach((f) => {
    vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, { filename: f });
  });
  return ctx;
}

module.exports = { loadGas };
