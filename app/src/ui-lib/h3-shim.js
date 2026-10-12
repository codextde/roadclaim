const Native = globalThis.TextDecoder;
let supported = true;
try {
  if (Native) new Native('utf-16le');
} catch {
  supported = false;
}
if (!supported) globalThis.TextDecoder = undefined;
const h3 = require('h3-js/dist/h3-js.js');
if (!supported) globalThis.TextDecoder = Native;
module.exports = h3;
