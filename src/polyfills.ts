// Loaded FIRST in the entry point. Provides Promise, Map/Set, Object.assign,
// Array.prototype.includes, Symbol, etc. for Chromium 38 (webOS 3.x),
// plus regenerator-runtime for transpiled async/await and fetch().
import "core-js/stable";
import "regenerator-runtime/runtime";
import "whatwg-fetch";
