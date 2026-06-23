const fs = require('fs');
const path = 'D:/pycharmProjects/xhsmedium_github/.tmp/tokens.json';
let raw = fs.readFileSync(path, 'utf8');
// parse lenient
const obj = {};
raw.replace(/"([^"]+)"\s*:\s*\{([^}]+)\}/g, (m, k, body) => {
  const role = (body.match(/"role":"([^"]+)"/) || [])[1];
  const token = (body.match(/"token":"([^"]+)"/) || [])[1];
  const legacyToken = (body.match(/"legacyToken":"([^"]+)"/) || [])[1];
  const userId = (body.match(/"userId":"([^"]+)"/) || [])[1];
  if (role && token) obj[k] = { role, token, legacyToken, userId };
  return '';
});
fs.writeFileSync(path, JSON.stringify(obj, null, 2));
console.log('Saved', Object.keys(obj).length, 'tokens');
