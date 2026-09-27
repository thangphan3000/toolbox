# Toolbox

A tiny collection of network, crypto, and diagram utilities that runs entirely in the browser. No build step, no backend - just three static files (`index.html`, `styles.css`, `app.js`) you can open directly from disk. The only external dependency is [mermaid](https://mermaid.js.org/), loaded from jsDelivr on demand when you open the mermaid tool.

## Contents

- [Features](#features)
- [Usage](#usage)
- [Project structure](#project-structure)
- [Tools](#tools)
- [Adding a new tool](#adding-a-new-tool)

## Features

- **CIDR IP Calculator** - single-input IPv4 subnet calculator with live results
- **Crypto** - hashes, ROT13, secure random, and JWT decoder
- **Mermaid** - live-rendered diagrams from mermaid source
- Pixel-art cat logo in a dark navbar
- Hash-based routing between the tool grid and individual tools
- Mermaid is fetched from jsDelivr on first open; every other tool works fully offline and sends no data anywhere

## Usage

Open `index.html` in any modern browser:

```sh
open index.html          # macOS
xdg-open index.html      # Linux
start index.html         # Windows
```

Or serve the directory with any static server if you prefer a real origin (needed if you extend the app to use features that require a secure context beyond what `file://` allows):

```sh
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Project structure

```
tools/
  index.html    markup for the navbar, tool grid, and every tool panel
  styles.css    all styling (navbar, cards, buttons, tool panels, results)
  app.js        routing + the calculator/crypto/mermaid logic
  README.md
```

There is no bundler and no framework. The only runtime dependency is `mermaid.min.js`, fetched from jsDelivr the first time the mermaid tool opens.

## Tools

### CIDR IP Calculator

Accepts a single combined input like `192.168.1.10/24`. If you omit the prefix, it defaults to `/32`. Calculation runs on each keystroke with a 200 ms debounce.

Output:

- Network and broadcast addresses
- Subnet mask and wildcard mask
- First and last usable host
- Total addresses and usable host count
- IP class (A/B/C/D/E)
- Type (`Private`, `Public`, `Loopback`, `Link-local`, `Multicast`, `Reserved`)
- Full 32-bit binary with the network prefix highlighted

Special cases: `/31` is treated as an RFC 3021 point-to-point link (both addresses usable, no broadcast); `/32` is a single host.

### Crypto

Operations:

| Button           | Notes                                                        |
| ---------------- | ------------------------------------------------------------ |
| `hash md5`       | Pure JS (SubtleCrypto does not expose MD5)                   |
| `hash sha1`      | `crypto.subtle.digest("SHA-1", ...)`                         |
| `hash sha256`    | `crypto.subtle.digest("SHA-256", ...)`                       |
| `rot 13`         | Letter rotation                                              |
| `random 1-100`   | `crypto.getRandomValues` on a `Uint32Array`                  |
| `random password`| 20 chars from a mixed alphabet, crypto-secure                |
| `decode jwt`     | Splits on `.`, base64url-decodes, pretty-prints header/payload |

The result card has `copy` (writes to clipboard) and `swap` (moves the result back into the input for chaining).

JWT decode escapes user content before rendering; pasting a malicious token cannot inject HTML.

### Mermaid

Paste any [mermaid](https://mermaid.js.org/) source (flowcharts, sequence diagrams, class diagrams, state diagrams, etc.) on the left and the rendered SVG appears on the right. Rendering is live with a 350 ms debounce, and syntax errors show inline under the source without wiping the last good preview immediately.

The mermaid library (~3.4 MB) is fetched from `cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js` the first time you open the tool; subsequent opens use the browser cache. Your diagram source and rendered SVGs never leave the browser - jsDelivr only sees the standard HTTP request for the script itself. Mermaid runs in `securityLevel: "strict"` so click-handlers embedded in diagrams are ignored.

If you want to remove the CDN dependency, download the file next to `app.js` and change `script.src` in `loadMermaid` to `"./mermaid.min.js"`:

```sh
curl -sSL -o mermaid.min.js https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js
```

## Adding a new tool

1. **Enable the button.** In `index.html`, either enable one of the existing disabled buttons or add a new one:

   ```html
   <a href="#mytool" class="tool-btn" data-tool="mytool">mytool</a>
   ```

2. **Add a tool panel.** After the existing `<article id="tool-...">` blocks, add:

   ```html
   <article id="tool-mytool" class="tool" hidden>
     <div class="tool-head">
       <a href="#" class="back" data-back>&larr; back</a>
       <h2>My Tool</h2>
     </div>
     <!-- form + results -->
   </article>
   ```

3. **Register it with the router.** In `app.js`, add an entry to the `panels` object:

   ```js
   const panels = {
     cidr: document.getElementById("tool-cidr"),
     crypto: document.getElementById("tool-crypto"),
     mermaid: document.getElementById("tool-mermaid"),
     mytool: document.getElementById("tool-mytool"),
   };
   ```

   The router picks up the new tool automatically from the hash (`#mytool`) and wires the back link.

4. Write the tool logic in the same IIFE, following the pattern used by the existing tools. If your tool needs one-time setup on first open (e.g. lazy-loading a library like mermaid does), add an entry to the `onOpen` map next to `panels`.
