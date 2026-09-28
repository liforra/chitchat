// Copyright (C) 2026 Leon Ankert
// SPDX-License-Identifier: AGPL-3.0-or-later
// Full license text: https://www.gnu.org/licenses/agpl-3.0.txt (also in LICENSE)

// Markdown for chat messages: a small, dependency-free, Discord-flavoured
// subset (bold, italic, underline, strikethrough, spoilers, inline code, code
// blocks, quotes, headings, lists, [masked](links)).
//
// Message text is untrusted, so nothing here ever goes through innerHTML: the
// parser produces a plain tree of data, and the renderers either build DOM
// nodes with createElement/textContent or escape everything into a string.
// Only http(s) URLs are ever turned into links.
//
// Loaded before content.js; relies on findLinksInText/linkifyToHtml from it
// (at call time only) to turn bare URLs inside text into links.

const MD_MAX_DEPTH = 4;
const MD_ESCAPABLE = "\\`*_{}[]()#+-.!|~>";

// Cheap pre-check so plain messages are never touched.
function mdHasMarkup(text) {
  return /[*_~`|]/.test(text)
    || /^[ \t]*(?:>|#{1,3}[ \t]|[-+][ \t]|\d+[.)][ \t])/m.test(text)
    || /\[[^\]\n]+\]\([^)\s]+\)/.test(text);
}

function mdIsWordChar(ch) {
  return Boolean(ch) && /[\p{L}\p{N}]/u.test(ch);
}

// ---- Inline ---------------------------------------------------------------

function mdParseInline(s, depth = 0) {
  const nodes = [];
  let buf = "";
  const flushText = () => {
    if (buf) {
      nodes.push({ type: "text", text: buf });
      buf = "";
    }
  };

  const EMPHASIS = [
    ["***", "bolditalic"], ["**", "bold"], ["__", "underline"],
    ["*", "italic"], ["_", "italic"], ["~~", "strike"]
  ];

  // Finds the closing delimiter for an emphasis run opened at `open`.
  const findClose = (delim, open) => {
    const len = delim.length;
    const wordy = delim[0] === "_";
    let from = open + len + 1;
    for (;;) {
      const j = s.indexOf(delim, from);
      if (j === -1) {
        return -1;
      }
      const after = s[j + len];
      if (len === 1 && after === delim) {
        from = j + 2; // part of a longer run (e.g. the ** inside *a **b** c*)
        continue;
      }
      if (/\s/.test(s[j - 1] || " ") || (wordy && mdIsWordChar(after))) {
        from = j + 1;
        continue;
      }
      return j;
    }
  };

  let i = 0;
  while (i < s.length) {
    const c = s[i];

    if (c === "\\" && i + 1 < s.length && MD_ESCAPABLE.includes(s[i + 1])) {
      buf += s[i + 1];
      i += 2;
      continue;
    }

    if (c === "`") {
      let n = 1;
      while (s[i + n] === "`") {
        n += 1;
      }
      if (n <= 2) {
        const closer = new RegExp("(?<!`)`{" + n + "}(?!`)", "g");
        closer.lastIndex = i + n;
        const m = closer.exec(s);
        if (m && m.index > i + n) {
          flushText();
          let code = s.slice(i + n, m.index);
          if (n === 2 && code.startsWith(" ") && code.endsWith(" ") && code.trim()) {
            code = code.slice(1, -1);
          }
          nodes.push({ type: "code", text: code });
          i = m.index + n;
          continue;
        }
      }
      buf += "`".repeat(n);
      i += n;
      continue;
    }

    if (c === "[" && depth < MD_MAX_DEPTH) {
      const m = /^\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/.exec(s.slice(i));
      if (m) {
        let href = null;
        try {
          const url = new URL(m[2]);
          href = url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
        } catch (error) {
          href = null;
        }
        if (href) {
          flushText();
          nodes.push({ type: "link", url: href, label: m[1], children: mdParseInline(m[1], depth + 1) });
          i += m[0].length;
          continue;
        }
      }
    }

    if (c === "|" && s[i + 1] === "|" && depth < MD_MAX_DEPTH) {
      const j = s.indexOf("||", i + 2);
      if (j > i + 2 && s.slice(i + 2, j).trim()) {
        flushText();
        nodes.push({ type: "spoiler", children: mdParseInline(s.slice(i + 2, j), depth + 1) });
        i = j + 2;
        continue;
      }
    }

    let matched = false;
    if (depth < MD_MAX_DEPTH) {
      for (const [delim, type] of EMPHASIS) {
        if (!s.startsWith(delim, i)) {
          continue;
        }
        const next = s[i + delim.length];
        if (!next || /\s/.test(next)) {
          continue;
        }
        if (delim[0] === "_" && mdIsWordChar(s[i - 1])) {
          continue; // snake_case_words: an underscore inside a word isn't emphasis
        }
        const close = findClose(delim, i);
        if (close === -1) {
          continue;
        }
        flushText();
        nodes.push({ type, children: mdParseInline(s.slice(i + delim.length, close), depth + 1) });
        i = close + delim.length;
        matched = true;
        break;
      }
    }
    if (matched) {
      continue;
    }

    buf += c;
    i += 1;
  }
  flushText();
  return nodes;
}

// ---- Blocks ---------------------------------------------------------------

function mdParse(text, depth = 0) {
  const lines = String(text).replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  let para = [];
  const flushPara = () => {
    const joined = para.join("\n").replace(/^\n+|\n+$/g, "");
    if (joined) {
      blocks.push({ type: "p", inline: mdParseInline(joined) });
    }
    para = [];
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Fenced code: ```lang ... ``` on separate lines, or ```one line```.
    if (/^[ \t]*```/.test(line)) {
      const trimmed = line.trim();
      if (trimmed.length > 6 && trimmed.endsWith("```")) {
        flushPara();
        blocks.push({ type: "code", lang: "", text: trimmed.slice(3, -3).replace(/^ /, "").replace(/ $/, "") });
        i += 1;
        continue;
      }
      let end = -1;
      for (let j = i + 1; j < lines.length; j += 1) {
        if (lines[j].trim().endsWith("```")) {
          end = j;
          break;
        }
      }
      if (end !== -1) {
        flushPara();
        const lang = /^[ \t]*```([\w+#.-]*)[ \t]*$/.exec(line);
        const body = lines.slice(i + 1, end);
        body.push(lines[end].replace(/[ \t]*```[ \t]*$/, ""));
        while (body.length && body[body.length - 1] === "") {
          body.pop();
        }
        blocks.push({ type: "code", lang: lang ? lang[1] : "", text: body.join("\n") });
        i = end + 1;
        continue;
      }
    }

    if (/^[ \t]*>[ \t]?/.test(line)) {
      flushPara();
      const inner = [];
      while (i < lines.length && /^[ \t]*>[ \t]?/.test(lines[i])) {
        inner.push(lines[i].replace(/^[ \t]*>[ \t]?/, ""));
        i += 1;
      }
      blocks.push({
        type: "quote",
        blocks: depth < 2 ? mdParse(inner.join("\n"), depth + 1) : [{ type: "p", inline: [{ type: "text", text: inner.join("\n") }] }]
      });
      continue;
    }

    const heading = /^[ \t]*(#{1,3})[ \t]+(.+?)[ \t]*$/.exec(line);
    if (heading) {
      flushPara();
      blocks.push({ type: "heading", level: heading[1].length, inline: mdParseInline(heading[2]) });
      i += 1;
      continue;
    }

    const item = /^[ \t]*(?:([-+])|(\d+)[.)])[ \t]+(.+)$/.exec(line);
    if (item) {
      flushPara();
      const ordered = Boolean(item[2]);
      const items = [];
      while (i < lines.length) {
        const m = /^[ \t]*(?:([-+])|(\d+)[.)])[ \t]+(.+)$/.exec(lines[i]);
        if (!m || Boolean(m[2]) !== ordered) {
          break;
        }
        items.push(mdParseInline(m[3]));
        i += 1;
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }

    para.push(line);
    i += 1;
  }
  flushPara();
  return blocks;
}

// True when the parse found no formatting at all (just text), so the message
// is better left exactly as the site rendered it.
function mdIsPlain(blocks) {
  return blocks.length <= 1 && blocks.every(block => block.type === "p" && block.inline.every(node => node.type === "text"));
}

// ---- Collecting links (for embeds / safety checks) --------------------------

function mdCollectLinks(nodes, out = []) {
  const walkInline = list => list.forEach(node => {
    if (node.type === "link") {
      out.push({ url: node.url, label: node.label });
    }
    if (node.children) {
      walkInline(node.children);
    }
  });
  const walkBlocks = list => list.forEach(block => {
    if (block.inline) {
      walkInline(block.inline);
    }
    if (block.items) {
      block.items.forEach(walkInline);
    }
    if (block.blocks) {
      walkBlocks(block.blocks);
    }
  });
  walkBlocks(nodes);
  return out;
}

// ---- DOM renderer ---------------------------------------------------------

const MD_INLINE_TAGS = { bold: "strong", italic: "em", underline: "u", strike: "s" };

function mdAnchor(doc, url, className) {
  const a = doc.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener noreferrer nofollow";
  a.className = className;
  return a;
}

function mdAppendText(doc, parent, text, autolink) {
  const pushText = chunk => {
    chunk.split("\n").forEach((piece, index) => {
      if (index > 0) {
        parent.appendChild(doc.createElement("br"));
      }
      if (piece) {
        parent.appendChild(doc.createTextNode(piece));
      }
    });
  };
  if (!autolink || typeof findLinksInText !== "function") {
    pushText(text);
    return;
  }
  let cursor = 0;
  findLinksInText(text).forEach(hit => {
    pushText(text.slice(cursor, hit.start));
    const a = mdAnchor(doc, hit.url, "cc-link");
    a.textContent = text.slice(hit.start, hit.end);
    parent.appendChild(a);
    cursor = hit.end;
  });
  pushText(text.slice(cursor));
}

function mdRenderInlineDom(doc, nodes, parent, inLink) {
  nodes.forEach(node => {
    if (node.type === "text") {
      mdAppendText(doc, parent, node.text, !inLink);
    } else if (node.type === "code") {
      const code = doc.createElement("code");
      code.className = "cc-md-code";
      code.textContent = node.text;
      parent.appendChild(code);
    } else if (node.type === "link") {
      const a = mdAnchor(doc, node.url, "cc-link cc-md-link");
      a.title = node.url;
      mdRenderInlineDom(doc, node.children, a, true);
      parent.appendChild(a);
    } else if (node.type === "spoiler") {
      const span = doc.createElement("span");
      span.className = "cc-md-spoiler";
      span.title = "Spoiler - click to reveal";
      span.addEventListener("click", event => {
        if (!span.classList.contains("is-revealed")) {
          event.preventDefault();
          event.stopPropagation();
          span.classList.add("is-revealed");
        }
      });
      mdRenderInlineDom(doc, node.children, span, inLink);
      parent.appendChild(span);
    } else if (node.type === "bolditalic") {
      const strong = doc.createElement("strong");
      const em = doc.createElement("em");
      mdRenderInlineDom(doc, node.children, em, inLink);
      strong.appendChild(em);
      parent.appendChild(strong);
    } else if (MD_INLINE_TAGS[node.type]) {
      const el = doc.createElement(MD_INLINE_TAGS[node.type]);
      mdRenderInlineDom(doc, node.children, el, inLink);
      parent.appendChild(el);
    }
  });
}

function mdRenderBlocksDom(doc, blocks, parent) {
  blocks.forEach(block => {
    if (block.type === "p") {
      const div = doc.createElement("div");
      div.className = "cc-md-p";
      mdRenderInlineDom(doc, block.inline, div, false);
      parent.appendChild(div);
    } else if (block.type === "code") {
      const pre = doc.createElement("pre");
      pre.className = "cc-md-pre";
      const code = doc.createElement("code");
      if (block.lang) {
        code.dataset.lang = block.lang;
      }
      code.textContent = block.text;
      pre.appendChild(code);
      parent.appendChild(pre);
    } else if (block.type === "quote") {
      const quote = doc.createElement("blockquote");
      quote.className = "cc-md-quote";
      mdRenderBlocksDom(doc, block.blocks, quote);
      parent.appendChild(quote);
    } else if (block.type === "heading") {
      const div = doc.createElement("div");
      div.className = `cc-md-h cc-md-h${block.level}`;
      mdRenderInlineDom(doc, block.inline, div, false);
      parent.appendChild(div);
    } else if (block.type === "list") {
      const list = doc.createElement(block.ordered ? "ol" : "ul");
      list.className = "cc-md-list";
      block.items.forEach(inline => {
        const li = doc.createElement("li");
        mdRenderInlineDom(doc, inline, li, false);
        list.appendChild(li);
      });
      parent.appendChild(list);
    }
  });
}

function mdRenderDom(doc, blocks) {
  const fragment = doc.createDocumentFragment();
  mdRenderBlocksDom(doc, blocks, fragment);
  return fragment;
}

// ---- HTML-string renderer (for the HTML export) -----------------------------

function mdEsc(text) {
  return String(text).replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
}

function mdText(text, autolink) {
  const html = autolink && typeof linkifyToHtml === "function" ? linkifyToHtml(text) : mdEsc(text);
  return html.replace(/\n/g, "<br>");
}

function mdRenderInlineHtml(nodes, inLink) {
  return nodes.map(node => {
    if (node.type === "text") {
      return mdText(node.text, !inLink);
    }
    if (node.type === "code") {
      return `<code class="cc-md-code">${mdEsc(node.text)}</code>`;
    }
    if (node.type === "link") {
      return `<a href="${mdEsc(node.url)}" target="_blank" rel="noopener noreferrer nofollow" class="cc-link cc-md-link" title="${mdEsc(node.url)}">${mdRenderInlineHtml(node.children, true)}</a>`;
    }
    if (node.type === "spoiler") {
      return `<span class="cc-md-spoiler" title="Spoiler - hover to reveal">${mdRenderInlineHtml(node.children, inLink)}</span>`;
    }
    if (node.type === "bolditalic") {
      return `<strong><em>${mdRenderInlineHtml(node.children, inLink)}</em></strong>`;
    }
    if (MD_INLINE_TAGS[node.type]) {
      const tag = MD_INLINE_TAGS[node.type];
      return `<${tag}>${mdRenderInlineHtml(node.children, inLink)}</${tag}>`;
    }
    return "";
  }).join("");
}

function mdRenderBlocksHtml(blocks) {
  return blocks.map(block => {
    if (block.type === "p") {
      return `<div class="cc-md-p">${mdRenderInlineHtml(block.inline, false)}</div>`;
    }
    if (block.type === "code") {
      return `<pre class="cc-md-pre"><code>${mdEsc(block.text)}</code></pre>`;
    }
    if (block.type === "quote") {
      return `<blockquote class="cc-md-quote">${mdRenderBlocksHtml(block.blocks)}</blockquote>`;
    }
    if (block.type === "heading") {
      return `<div class="cc-md-h cc-md-h${block.level}">${mdRenderInlineHtml(block.inline, false)}</div>`;
    }
    if (block.type === "list") {
      const tag = block.ordered ? "ol" : "ul";
      return `<${tag} class="cc-md-list">${block.items.map(item => `<li>${mdRenderInlineHtml(item, false)}</li>`).join("")}</${tag}>`;
    }
    return "";
  }).join("");
}

function mdRenderHtml(blocks) {
  return mdRenderBlocksHtml(blocks);
}
