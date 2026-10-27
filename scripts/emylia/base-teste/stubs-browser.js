globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {}, key: () => null, length: 0 };
globalThis.sessionStorage = globalThis.localStorage;
globalThis.window ??= globalThis;
globalThis.window.location ??= { protocol: "http:", href: "http://localhost/", pathname: "/", search: "", hash: "", origin: "http://localhost" };
globalThis.window.addEventListener ??= () => {}; globalThis.window.removeEventListener ??= () => {};
