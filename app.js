(function () {
  "use strict";

  // ---------- routing between grid and tool panel ----------

  const grid = document.getElementById("tool-grid");
  const panels = {
    cidr: document.getElementById("tool-cidr"),
    crypto: document.getElementById("tool-crypto"),
    mermaid: document.getElementById("tool-mermaid"),
  };

  const onOpen = {
    mermaid: () => initMermaid(),
  };

  function showTool(name) {
    const isTool = name && panels[name];
    grid.hidden = !!isTool;
    for (const [key, el] of Object.entries(panels)) {
      el.hidden = key !== name;
    }
    if (isTool && onOpen[name]) onOpen[name]();
  }

  document.querySelectorAll(".tool-btn[data-tool]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      const tool = el.getAttribute("data-tool");
      history.replaceState(null, "", "#" + tool);
      showTool(tool);
    });
  });

  document.querySelectorAll(".tool-btn.disabled").forEach((el) => {
    el.addEventListener("click", (e) => e.preventDefault());
  });

  document.querySelectorAll("[data-back], #back, #brand").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      history.replaceState(null, "", "#");
      setFocusMode(false);
      showTool(null);
    });
  });

  // ---------- focus (full-screen) mode ----------

  const focusToggles = document.querySelectorAll("[data-focus-toggle]");

  function setFocusMode(on) {
    document.body.classList.toggle("focus-mode", on);
    focusToggles.forEach((btn) => {
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      const label = btn.querySelector(".focus-label");
      if (label) label.textContent = on ? "exit full screen" : "full screen";
    });
  }

  focusToggles.forEach((btn) => {
    btn.addEventListener("click", () => {
      setFocusMode(!document.body.classList.contains("focus-mode"));
    });
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && document.body.classList.contains("focus-mode")) {
      setFocusMode(false);
    }
  });

  function toolFromHash() {
    const h = window.location.hash.replace(/^#/, "");
    return panels[h] ? h : null;
  }

  window.addEventListener("hashchange", () => showTool(toolFromHash()));

  // ---------- CIDR calculator ----------

  const form = document.getElementById("cidr-form");
  const ipInput = document.getElementById("ip");
  const errorEl = document.getElementById("error");
  const resultsEl = document.getElementById("results");

  const out = {
    network: document.getElementById("r-network"),
    broadcast: document.getElementById("r-broadcast"),
    mask: document.getElementById("r-mask"),
    wildcard: document.getElementById("r-wildcard"),
    first: document.getElementById("r-first"),
    last: document.getElementById("r-last"),
    total: document.getElementById("r-total"),
    usable: document.getElementById("r-usable"),
    class: document.getElementById("r-class"),
    type: document.getElementById("r-type"),
    binary: document.getElementById("r-binary"),
  };

  function parseIp(value) {
    const parts = value.trim().split(".");
    if (parts.length !== 4) return null;
    const octets = [];
    for (const p of parts) {
      if (!/^\d+$/.test(p)) return null;
      const n = Number(p);
      if (n < 0 || n > 255) return null;
      octets.push(n);
    }
    return octets;
  }

  function ipToInt(octets) {
    return (
      (octets[0] * 0x1000000 +
        (octets[1] << 16) +
        (octets[2] << 8) +
        octets[3]) >>>
      0
    );
  }

  function intToIp(n) {
    return [
      (n >>> 24) & 0xff,
      (n >>> 16) & 0xff,
      (n >>> 8) & 0xff,
      n & 0xff,
    ].join(".");
  }

  function maskFromPrefix(prefix) {
    if (prefix === 0) return 0;
    return (0xffffffff << (32 - prefix)) >>> 0;
  }

  function ipClass(firstOctet) {
    if (firstOctet < 128) return "A";
    if (firstOctet < 192) return "B";
    if (firstOctet < 224) return "C";
    if (firstOctet < 240) return "D (multicast)";
    return "E (reserved)";
  }

  function ipType(octets) {
    const [a, b] = octets;
    if (a === 10) return "Private";
    if (a === 172 && b >= 16 && b <= 31) return "Private";
    if (a === 192 && b === 168) return "Private";
    if (a === 127) return "Loopback";
    if (a === 169 && b === 254) return "Link-local";
    if (a >= 224 && a < 240) return "Multicast";
    if (a >= 240) return "Reserved";
    return "Public";
  }

  function toBinaryOctets(octets) {
    return octets.map((o) => o.toString(2).padStart(8, "0"));
  }

  function renderBinary(octets, prefix) {
    const flat = toBinaryOctets(octets).join("");
    const parts = [];
    for (let i = 0; i < 32; i++) {
      const bit = flat[i];
      parts.push(
        i < prefix ? `<span class="octet-network">${bit}</span>` : bit
      );
      if (i === 7 || i === 15 || i === 23) parts.push(".");
    }
    out.binary.innerHTML = parts.join("");
  }

  function formatNumber(n) {
    return n.toLocaleString("en-US");
  }

  function showError(msg) {
    errorEl.textContent = msg;
    resultsEl.hidden = true;
  }

  function clearError() {
    errorEl.textContent = "";
  }

  function calculate(ipStr, prefix) {
    const octets = parseIp(ipStr);
    if (!octets) {
      showError("Enter a valid IPv4 address (e.g. 192.168.1.10).");
      return;
    }
    if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) {
      showError("CIDR prefix must be an integer between 0 and 32.");
      return;
    }

    clearError();

    const ipInt = ipToInt(octets);
    const maskInt = maskFromPrefix(prefix);
    const wildcardInt = (~maskInt) >>> 0;
    const networkInt = (ipInt & maskInt) >>> 0;
    const broadcastInt = (networkInt | wildcardInt) >>> 0;

    const totalAddresses =
      prefix === 0 ? 4294967296 : Math.pow(2, 32 - prefix);
    let usableHosts;
    let firstHost;
    let lastHost;

    if (prefix === 32) {
      usableHosts = 1;
      firstHost = intToIp(networkInt);
      lastHost = intToIp(networkInt);
    } else if (prefix === 31) {
      usableHosts = 2;
      firstHost = intToIp(networkInt);
      lastHost = intToIp(broadcastInt);
    } else {
      usableHosts = totalAddresses - 2;
      firstHost = intToIp((networkInt + 1) >>> 0);
      lastHost = intToIp((broadcastInt - 1) >>> 0);
    }

    out.network.textContent = `${intToIp(networkInt)}/${prefix}`;
    out.broadcast.textContent = prefix >= 31 ? "-" : intToIp(broadcastInt);
    out.mask.textContent = intToIp(maskInt);
    out.wildcard.textContent = intToIp(wildcardInt);
    out.first.textContent = firstHost;
    out.last.textContent = lastHost;
    out.total.textContent = formatNumber(totalAddresses);
    out.usable.textContent = formatNumber(usableHosts);
    out.class.textContent = ipClass(octets[0]);
    out.type.textContent = ipType(octets);

    renderBinary(octets, prefix);

    resultsEl.hidden = false;
  }

  function parseCombined(raw) {
    const value = raw.trim();
    if (value === "") return { ip: "", prefix: 32, hasPrefix: false };
    const [ipPart, prefixPart] = value.split("/", 2);
    const ip = ipPart.trim();
    if (prefixPart === undefined || prefixPart.trim() === "") {
      return { ip, prefix: 32, hasPrefix: false };
    }
    const trimmed = prefixPart.trim();
    if (!/^\d+$/.test(trimmed)) return { ip, prefix: NaN, hasPrefix: true };
    return { ip, prefix: Number(trimmed), hasPrefix: true };
  }

  function runCalc() {
    const { ip, prefix } = parseCombined(ipInput.value);
    if (ip === "") {
      clearError();
      resultsEl.hidden = true;
      return;
    }
    calculate(ip, prefix);
  }

  function debounce(fn, wait) {
    let t;
    return function debounced() {
      clearTimeout(t);
      t = setTimeout(fn, wait);
    };
  }

  const debouncedCalc = debounce(runCalc, 200);

  form.addEventListener("submit", (e) => e.preventDefault());
  ipInput.addEventListener("input", debouncedCalc);

  runCalc();

  // ---------- Crypto tool ----------

  const cryptoInput = document.getElementById("crypto-input");
  const cryptoOutput = document.getElementById("crypto-output");
  const cryptoResult = document.getElementById("crypto-result");
  const cryptoErr = document.getElementById("crypto-error");
  const cryptoLabel = document.getElementById("crypto-op-label");
  const cryptoSwap = document.getElementById("crypto-swap");
  const cryptoCopy = document.getElementById("crypto-copy");

  // Pure-JS MD5 (SubtleCrypto does not expose MD5).
  function md5(str) {
    function add32(a, b) { return (a + b) & 0xffffffff; }
    function rol(x, n) { return (x << n) | (x >>> (32 - n)); }
    function cmn(q, a, b, x, s, t) {
      return add32(rol(add32(add32(a, q), add32(x, t)), s), b);
    }
    function ff(a,b,c,d,x,s,t){return cmn((b&c)|((~b)&d),a,b,x,s,t);}
    function gg(a,b,c,d,x,s,t){return cmn((b&d)|(c&(~d)),a,b,x,s,t);}
    function hh(a,b,c,d,x,s,t){return cmn(b^c^d,a,b,x,s,t);}
    function ii(a,b,c,d,x,s,t){return cmn(c^(b|(~d)),a,b,x,s,t);}

    const bytes = new TextEncoder().encode(str);
    const nblk = ((bytes.length + 8) >> 6) + 1;
    const blks = new Array(nblk * 16).fill(0);
    for (let i = 0; i < bytes.length; i++)
      blks[i >> 2] |= bytes[i] << ((i % 4) * 8);
    blks[bytes.length >> 2] |= 0x80 << ((bytes.length % 4) * 8);
    blks[nblk * 16 - 2] = bytes.length * 8;

    let a = 1732584193, b = -271733879, c = -1732584194, d = 271733878;
    for (let i = 0; i < blks.length; i += 16) {
      const oa=a, ob=b, oc=c, od=d;
      a=ff(a,b,c,d,blks[i+ 0], 7,-680876936);
      d=ff(d,a,b,c,blks[i+ 1],12,-389564586);
      c=ff(c,d,a,b,blks[i+ 2],17, 606105819);
      b=ff(b,c,d,a,blks[i+ 3],22,-1044525330);
      a=ff(a,b,c,d,blks[i+ 4], 7,-176418897);
      d=ff(d,a,b,c,blks[i+ 5],12, 1200080426);
      c=ff(c,d,a,b,blks[i+ 6],17,-1473231341);
      b=ff(b,c,d,a,blks[i+ 7],22,-45705983);
      a=ff(a,b,c,d,blks[i+ 8], 7, 1770035416);
      d=ff(d,a,b,c,blks[i+ 9],12,-1958414417);
      c=ff(c,d,a,b,blks[i+10],17,-42063);
      b=ff(b,c,d,a,blks[i+11],22,-1990404162);
      a=ff(a,b,c,d,blks[i+12], 7, 1804603682);
      d=ff(d,a,b,c,blks[i+13],12,-40341101);
      c=ff(c,d,a,b,blks[i+14],17,-1502002290);
      b=ff(b,c,d,a,blks[i+15],22, 1236535329);

      a=gg(a,b,c,d,blks[i+ 1], 5,-165796510);
      d=gg(d,a,b,c,blks[i+ 6], 9,-1069501632);
      c=gg(c,d,a,b,blks[i+11],14, 643717713);
      b=gg(b,c,d,a,blks[i+ 0],20,-373897302);
      a=gg(a,b,c,d,blks[i+ 5], 5,-701558691);
      d=gg(d,a,b,c,blks[i+10], 9, 38016083);
      c=gg(c,d,a,b,blks[i+15],14,-660478335);
      b=gg(b,c,d,a,blks[i+ 4],20,-405537848);
      a=gg(a,b,c,d,blks[i+ 9], 5, 568446438);
      d=gg(d,a,b,c,blks[i+14], 9,-1019803690);
      c=gg(c,d,a,b,blks[i+ 3],14,-187363961);
      b=gg(b,c,d,a,blks[i+ 8],20, 1163531501);
      a=gg(a,b,c,d,blks[i+13], 5,-1444681467);
      d=gg(d,a,b,c,blks[i+ 2], 9,-51403784);
      c=gg(c,d,a,b,blks[i+ 7],14, 1735328473);
      b=gg(b,c,d,a,blks[i+12],20,-1926607734);

      a=hh(a,b,c,d,blks[i+ 5], 4,-378558);
      d=hh(d,a,b,c,blks[i+ 8],11,-2022574463);
      c=hh(c,d,a,b,blks[i+11],16, 1839030562);
      b=hh(b,c,d,a,blks[i+14],23,-35309556);
      a=hh(a,b,c,d,blks[i+ 1], 4,-1530992060);
      d=hh(d,a,b,c,blks[i+ 4],11, 1272893353);
      c=hh(c,d,a,b,blks[i+ 7],16,-155497632);
      b=hh(b,c,d,a,blks[i+10],23,-1094730640);
      a=hh(a,b,c,d,blks[i+13], 4, 681279174);
      d=hh(d,a,b,c,blks[i+ 0],11,-358537222);
      c=hh(c,d,a,b,blks[i+ 3],16,-722521979);
      b=hh(b,c,d,a,blks[i+ 6],23, 76029189);
      a=hh(a,b,c,d,blks[i+ 9], 4,-640364487);
      d=hh(d,a,b,c,blks[i+12],11,-421815835);
      c=hh(c,d,a,b,blks[i+15],16, 530742520);
      b=hh(b,c,d,a,blks[i+ 2],23,-995338651);

      a=ii(a,b,c,d,blks[i+ 0], 6,-198630844);
      d=ii(d,a,b,c,blks[i+ 7],10, 1126891415);
      c=ii(c,d,a,b,blks[i+14],15,-1416354905);
      b=ii(b,c,d,a,blks[i+ 5],21,-57434055);
      a=ii(a,b,c,d,blks[i+12], 6, 1700485571);
      d=ii(d,a,b,c,blks[i+ 3],10,-1894986606);
      c=ii(c,d,a,b,blks[i+10],15,-1051523);
      b=ii(b,c,d,a,blks[i+ 1],21,-2054922799);
      a=ii(a,b,c,d,blks[i+ 8], 6, 1873313359);
      d=ii(d,a,b,c,blks[i+15],10,-30611744);
      c=ii(c,d,a,b,blks[i+ 6],15,-1560198380);
      b=ii(b,c,d,a,blks[i+13],21, 1309151649);
      a=ii(a,b,c,d,blks[i+ 4], 6,-145523070);
      d=ii(d,a,b,c,blks[i+11],10,-1120210379);
      c=ii(c,d,a,b,blks[i+ 2],15, 718787259);
      b=ii(b,c,d,a,blks[i+ 9],21,-343485551);

      a = add32(a, oa); b = add32(b, ob);
      c = add32(c, oc); d = add32(d, od);
    }

    function rhex(n) {
      let s = "";
      for (let j = 0; j < 4; j++) {
        s += ((n >>> (j * 8)) & 0xff).toString(16).padStart(2, "0");
      }
      return s;
    }
    return rhex(a) + rhex(b) + rhex(c) + rhex(d);
  }

  async function subtleHash(algo, str) {
    const bytes = new TextEncoder().encode(str);
    const buf = await window.crypto.subtle.digest(algo, bytes);
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  function rot13(str) {
    return str.replace(/[a-zA-Z]/g, (c) => {
      const base = c <= "Z" ? 65 : 97;
      return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
    });
  }

  function randomBetween1and100() {
    const arr = new Uint32Array(1);
    window.crypto.getRandomValues(arr);
    return String((arr[0] % 100) + 1);
  }

  function randomPassword(len = 20) {
    const chars =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*-_=+";
    const arr = new Uint32Array(len);
    window.crypto.getRandomValues(arr);
    let out = "";
    for (let i = 0; i < len; i++) out += chars[arr[i] % chars.length];
    return out;
  }

  function b64urlDecode(str) {
    let s = str.replace(/-/g, "+").replace(/_/g, "/");
    const pad = s.length % 4;
    if (pad) s += "=".repeat(4 - pad);
    return atob(s);
  }

  function prettyJson(text) {
    try {
      return JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      return text;
    }
  }

  function decodeJwt(token) {
    const parts = token.trim().split(".");
    if (parts.length !== 3) {
      throw new Error("Not a valid JWT (expected three '.'-separated parts).");
    }
    const [h, p, s] = parts;
    let header, payload;
    try {
      header = prettyJson(b64urlDecode(h));
    } catch {
      throw new Error("Could not decode JWT header.");
    }
    try {
      payload = prettyJson(b64urlDecode(p));
    } catch {
      throw new Error("Could not decode JWT payload.");
    }
    return { header, payload, signature: s };
  }

  function showCryptoError(msg) {
    cryptoErr.textContent = msg;
    cryptoOutput.hidden = true;
  }

  function showCryptoResult(label, value, isHtml = false) {
    cryptoErr.textContent = "";
    cryptoLabel.textContent = label;
    if (isHtml) cryptoResult.innerHTML = value;
    else cryptoResult.textContent = value;
    cryptoOutput.hidden = false;
  }

  const OP_LABELS = {
    md5: "md5",
    sha1: "sha1",
    sha256: "sha256",
    rot13: "rot 13",
    random: "random 1-100",
    password: "random password",
    jwt: "decode jwt",
  };

  async function runOp(op) {
    const input = cryptoInput.value;
    const needsInput = op !== "random" && op !== "password";
    if (needsInput && input.trim().length === 0) {
      showCryptoError("Enter some input first.");
      return;
    }

    try {
      switch (op) {
        case "md5":
          showCryptoResult(OP_LABELS.md5, md5(input));
          break;
        case "sha1":
          showCryptoResult(OP_LABELS.sha1, await subtleHash("SHA-1", input));
          break;
        case "sha256":
          showCryptoResult(
            OP_LABELS.sha256,
            await subtleHash("SHA-256", input)
          );
          break;
        case "rot13":
          showCryptoResult(OP_LABELS.rot13, rot13(input));
          break;
        case "random":
          showCryptoResult(OP_LABELS.random, randomBetween1and100());
          break;
        case "password":
          showCryptoResult(OP_LABELS.password, randomPassword(20));
          break;
        case "jwt": {
          const { header, payload, signature } = decodeJwt(input);
          const escape = (s) =>
            s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
          const html =
            `<span class="jwt-section">header:</span>${escape(header)}` +
            `<span class="jwt-section">payload:</span>${escape(payload)}` +
            `<span class="jwt-section">signature:</span>${escape(signature)}`;
          showCryptoResult(OP_LABELS.jwt, html, true);
          break;
        }
      }
    } catch (err) {
      showCryptoError(err.message || String(err));
    }
  }

  document.querySelectorAll(".op-btn").forEach((btn) => {
    btn.addEventListener("click", () => runOp(btn.getAttribute("data-op")));
  });

  cryptoSwap.addEventListener("click", (e) => {
    e.preventDefault();
    cryptoInput.value = cryptoResult.textContent;
    cryptoOutput.hidden = true;
    cryptoInput.focus();
  });

  cryptoCopy.addEventListener("click", async (e) => {
    e.preventDefault();
    try {
      await navigator.clipboard.writeText(cryptoResult.textContent);
      const orig = cryptoCopy.textContent;
      cryptoCopy.textContent = "copied";
      setTimeout(() => (cryptoCopy.textContent = orig), 1000);
    } catch {
      showCryptoError("Copy failed - your browser blocked clipboard access.");
    }
  });

  // ---------- Mermaid tool ----------

  const mermaidInput = document.getElementById("mermaid-input");
  const mermaidOutput = document.getElementById("mermaid-output");
  const mermaidErr = document.getElementById("mermaid-error");

  let mermaidLoadPromise = null;
  let mermaidRenderCounter = 0;
  let mermaidInitialized = false;

  function loadMermaid() {
    if (mermaidLoadPromise) return mermaidLoadPromise;
    mermaidLoadPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src =
        "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js";
      script.async = true;
      script.onload = () => {
        if (!window.mermaid) {
          reject(new Error("mermaid loaded but window.mermaid is missing."));
          return;
        }
        window.mermaid.initialize({
          startOnLoad: false,
          theme: "default",
          securityLevel: "strict",
          fontFamily: "Menlo, Consolas, monospace",
        });
        resolve(window.mermaid);
      };
      script.onerror = () =>
        reject(new Error("Failed to load mermaid from the CDN."));
      document.head.appendChild(script);
    });
    return mermaidLoadPromise;
  }

  async function renderMermaid() {
    const source = mermaidInput.value.trim();
    if (!source) {
      mermaidOutput.innerHTML =
        '<span class="mermaid-placeholder">Type mermaid source on the left.</span>';
      mermaidErr.textContent = "";
      return;
    }
    try {
      const mermaid = await loadMermaid();
      await mermaid.parse(source);
      const id = "mermaid-svg-" + ++mermaidRenderCounter;
      const { svg } = await mermaid.render(id, source);
      mermaidOutput.innerHTML = svg;
      mermaidErr.textContent = "";
    } catch (err) {
      const msg = (err && err.message) || String(err);
      mermaidErr.textContent = msg.split("\n")[0].slice(0, 300);
    }
  }

  const debouncedMermaid = debounce(renderMermaid, 350);
  mermaidInput.addEventListener("input", debouncedMermaid);

  // Split-pane resizer between source and preview.
  const mermaidSplit = document.getElementById("mermaid-split");
  const mermaidResizer = document.getElementById("mermaid-resizer");
  const MERMAID_SPLIT_KEY = "mermaid-split-source-px";
  const MIN_PANE = 200;
  const RESIZER_W = 12;
  const GAP = 8;

  function applySourceWidth(px) {
    mermaidSplit.style.setProperty("--mermaid-source", px + "px");
  }

  function clampSourceWidth(px) {
    const total = mermaidSplit.getBoundingClientRect().width;
    const max = total - RESIZER_W - GAP * 2 - MIN_PANE;
    return Math.max(MIN_PANE, Math.min(max, px));
  }

  try {
    const saved = parseFloat(localStorage.getItem(MERMAID_SPLIT_KEY));
    if (Number.isFinite(saved) && saved > 0) applySourceWidth(saved);
  } catch { /* localStorage may be unavailable */ }

  let dragStartX = 0;
  let dragStartWidth = 0;

  function onDragMove(e) {
    const dx = e.clientX - dragStartX;
    applySourceWidth(clampSourceWidth(dragStartWidth + dx));
  }

  function onDragEnd() {
    document.removeEventListener("mousemove", onDragMove);
    document.removeEventListener("mouseup", onDragEnd);
    document.body.classList.remove("mermaid-resizing");
    mermaidResizer.classList.remove("dragging");
    const px = parseFloat(mermaidSplit.style.getPropertyValue("--mermaid-source"));
    if (Number.isFinite(px)) {
      try { localStorage.setItem(MERMAID_SPLIT_KEY, String(px)); } catch {}
    }
  }

  mermaidResizer.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const field = mermaidSplit.querySelector(".mermaid-field");
    dragStartX = e.clientX;
    dragStartWidth = field.getBoundingClientRect().width;
    document.body.classList.add("mermaid-resizing");
    mermaidResizer.classList.add("dragging");
    document.addEventListener("mousemove", onDragMove);
    document.addEventListener("mouseup", onDragEnd);
  });

  mermaidResizer.addEventListener("dblclick", () => {
    mermaidSplit.style.removeProperty("--mermaid-source");
    try { localStorage.removeItem(MERMAID_SPLIT_KEY); } catch {}
  });

  mermaidResizer.addEventListener("keydown", (e) => {
    const step = e.shiftKey ? 40 : 10;
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const field = mermaidSplit.querySelector(".mermaid-field");
    const current = field.getBoundingClientRect().width;
    const next = clampSourceWidth(current + (e.key === "ArrowRight" ? step : -step));
    applySourceWidth(next);
    try { localStorage.setItem(MERMAID_SPLIT_KEY, String(next)); } catch {}
  });

  function initMermaid() {
    if (mermaidInitialized) return;
    mermaidInitialized = true;
    renderMermaid();
  }

  // All tool state is now set up; safe to route to the initial hash.
  showTool(toolFromHash());
})();
