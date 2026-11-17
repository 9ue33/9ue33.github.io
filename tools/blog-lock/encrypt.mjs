#!/usr/bin/env node
/**
 * Build-time article encryptor.
 *
 * Usage:
 *   hugo --gc --minify
 *   node tools/blog-lock/encrypt.mjs [--public public] [--content content]
 *
 * A post opts in with front matter:
 *   password: true                 # marker only, never the secret
 *   passwordHint: "optional hint"  # optional, public
 *
 * The actual password is read from the BLOG_LOCK_PASSWORD environment variable
 * (CI: a repository secret) or from an untracked `.blog-lock.env` file in the
 * repository root. It is only used to derive the encryption key and never ends
 * up in the generated site or the repository.
 *
 * For every locked post the rendered article body (and its table of contents)
 * is replaced by a lock panel plus an AES-256-GCM ciphertext. Nothing readable
 * is left in the generated HTML; the browser decrypts after the password is
 * entered (see static/js/blog-lock.js).
 *
 * Feed entries of locked posts are removed so RSS does not leak summaries.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ITERATIONS = 200000;
const ASSET_TAGS =
  '<link rel="stylesheet" href="/css/blog-lock.css">' +
  '<script src="/js/blog-lock.js" defer></script>';
const CONTENT_CLASSES = ["e-content", "article-entry"];
const TOC_CLASSES = ["sidebar-toc-wrapper", "toc-div-class"];

const argv = process.argv.slice(2);
function option(name, fallback) {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
}

const cwd = process.cwd();
const publicDir = path.resolve(cwd, option("public", "public"));
const contentDir = path.resolve(cwd, option("content", "content"));

function fail(message) {
  console.error(`[blog-lock] ${message}`);
  process.exit(1);
}

function warn(message) {
  console.warn(`[blog-lock] ${message}`);
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function unquote(value) {
  const v = value.trim();
  if (v.length >= 2) {
    const first = v[0];
    const last = v[v.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return v.slice(1, -1).replace(/\\(["'])/g, "$1");
    }
  }
  return v;
}

/**
 * Minimal YAML front matter reader: top-level `key: value` pairs plus one
 * level of nesting (used for `lock:` blocks). The site's posts only need that.
 */
function parseFrontMatter(raw) {
  const text = stripBom(raw);
  const match = text.match(/^(?:---|\+\+\+)\r?\n([\s\S]*?)\r?\n(?:---|\+\+\+)(?:\r?\n|$)/);
  if (!match) return { data: {}, body: text };

  const data = {};
  let section = null;
  for (const rawLine of match[1].split(/\r?\n/)) {
    const line = rawLine.replace(/\s+#.*$/, "");
    if (!line.trim() || line.trim().startsWith("#")) continue;

    const top = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (top) {
      const [, key, value] = top;
      if (value.trim() === "") {
        section = key;
        data[key] = data[key] && typeof data[key] === "object" ? data[key] : {};
      } else {
        section = null;
        data[key] = unquote(value);
      }
      continue;
    }

    const nested = line.match(/^\s+([A-Za-z0-9_-]+):\s*(.*)$/);
    if (nested && section && data[section] && typeof data[section] === "object") {
      data[section][nested[1]] = unquote(nested[2]);
    }
  }

  return { data, body: text.slice(match[0].length) };
}

/** Lock configuration from front matter, or null when the post is public. */
const LOCK_ENV_FILE = path.resolve(cwd, ".blog-lock.env");
const LOCK_ENV_NAME = "BLOG_LOCK_PASSWORD";

/** Password for the whole build: process env wins, then .blog-lock.env. */
function resolveLockPassword() {
  if (process.env[LOCK_ENV_NAME]) return process.env[LOCK_ENV_NAME];
  if (!fs.existsSync(LOCK_ENV_FILE)) return null;

  for (const line of fs.readFileSync(LOCK_ENV_FILE, "utf8").split(/\r?\n/)) {
    const match = line.match(
      /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/,
    );
    if (match && match[1] === LOCK_ENV_NAME) return unquote(match[2]);
  }
  return null;
}

/**
 * A post is locked when front matter says `password: true`. A literal string is
 * rejected: the repository is public, so the secret must live in the
 * environment, not in the content.
 */
function lockConfig(frontMatter) {
  const lock = frontMatter.lock;
  const lockMap = lock && typeof lock === "object" ? lock : {};
  const raw =
    frontMatter.password !== undefined ? frontMatter.password : lockMap.password;
  if (raw === undefined || raw === null) return null;
  if (typeof raw === "object") return null;

  const value = String(raw).trim();
  if (!value) return null;

  const marker = value.toLowerCase();
  const isMarker = marker === "true" || marker === "yes" || marker === "1";
  const hint = String(
    frontMatter.passwordHint || frontMatter.password_hint || lockMap.hint || "",
  ).trim();

  return { locked: true, isMarker, literal: isMarker ? "" : value, hint };
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** source path (relative to content/) -> permalink */
function hugoPageMap() {
  const result = spawnSync("hugo", ["list", "all"], {
    cwd,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) {
    fail(`cannot run hugo list all: ${result.error.message}`);
  }
  if (result.status !== 0) {
    fail(`hugo list all failed: ${(result.stderr || "").trim()}`);
  }

  const rows = parseCsv(stripBom(result.stdout).trim());
  if (!rows.length) return new Map();
  const header = rows.shift().map((h) => h.trim());
  const pathIndex = header.indexOf("path");
  const permalinkIndex = header.indexOf("permalink");
  if (pathIndex < 0 || permalinkIndex < 0) {
    fail("unexpected output from hugo list all");
  }

  const map = new Map();
  for (const row of rows) {
    const source = row[pathIndex].replace(/^content[\\/]/, "").replace(/\\/g, "/");
    map.set(source, row[permalinkIndex]);
  }
  return map;
}

/** Find the opening tag of the first element whose class list covers `classes`. */
function findOpenTag(html, tag, classes, from = 0) {
  const re = new RegExp(`<${tag}\\b[^>]*>`, "g");
  re.lastIndex = from;
  let match;
  while ((match = re.exec(html))) {
    const classMatch = match[0].match(/\bclass\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const classList = classMatch
      ? (classMatch[1] || classMatch[2] || classMatch[3] || "").split(/\s+/)
      : [];
    if (classes.every((name) => classList.includes(name))) {
      return { start: match.index, end: match.index + match[0].length };
    }
  }
  return null;
}

/** Index of the matching </div> for a div opened at `openEnd`. */
function findClosingDiv(html, openEnd) {
  const re = /<div\b|<\/div>/g;
  re.lastIndex = openEnd;
  let depth = 1;
  let match;
  while ((match = re.exec(html))) {
    if (match[0] === "</div>") {
      depth -= 1;
      if (depth === 0) return match.index;
    } else {
      depth += 1;
    }
  }
  return -1;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function encryptPayload(plaintext, password, hint) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.pbkdf2Sync(Buffer.from(password, "utf8"), salt, ITERATIONS, 32, "sha256");
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
    cipher.getAuthTag(),
  ]);

  const payload = {
    v: 1,
    hint: hint || "",
    kdf: {
      name: "PBKDF2",
      hash: "SHA-256",
      iterations: ITERATIONS,
      salt: salt.toString("base64"),
    },
    cipher: {
      name: "AES-GCM",
      iv: iv.toString("base64"),
      data: encrypted.toString("base64"),
    },
  };

  // Keep "<" out of the inline JSON so it cannot terminate the script tag.
  return JSON.stringify(payload)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function buildPanel(hint, payload) {
  const hintHtml = hint
    ? `<p class="blog-lock-hint">提示：${escapeHtml(hint)}</p>`
    : "";
  return (
    '<div class="blog-lock" data-blog-lock>' +
    '<div class="blog-lock-card">' +
    '<div class="blog-lock-icon" aria-hidden="true">' +
    '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
    '<rect x="4" y="10" width="16" height="10" rx="2"></rect>' +
    '<path d="M8 10V7a4 4 0 0 1 8 0v3"></path>' +
    '<circle cx="12" cy="15" r="1.2" fill="currentColor" stroke="none"></circle>' +
    "</svg>" +
    "</div>" +
    '<p class="blog-lock-title">本文已加密</p>' +
    '<p class="blog-lock-sub">请输入密码后查看内容</p>' +
    hintHtml +
    '<form class="blog-lock-form" autocomplete="off">' +
    '<input class="blog-lock-input" type="password" name="password" placeholder="请输入密码" aria-label="密码" autocomplete="current-password" required>' +
    '<button class="blog-lock-submit" type="submit">进入</button>' +
    "</form>" +
    '<p class="blog-lock-error" role="alert" hidden>密码错误，请重试</p>' +
    "</div>" +
    "</div>" +
    `<script type="application/json" class="blog-lock-payload">${payload}</script>`
  );
}

/**
 * Replace the `description` value of the theme's inline window.REIMU_POST
 * object. Handles "..." / '...' / `...` values (the minifier prefers the
 * latter for strings containing newlines).
 */
function scrubInlineDescription(html) {
  const marker = "window.REIMU_POST";
  const markerIndex = html.indexOf(marker);
  if (markerIndex < 0) return html;

  const scriptEnd = html.indexOf("</script>", markerIndex);
  const blockEnd = scriptEnd < 0 ? html.length : scriptEnd;
  const block = html.slice(markerIndex, blockEnd);

  const keyIndex = block.indexOf("description:");
  if (keyIndex < 0) return html;

  let cursor = keyIndex + "description:".length;
  while (cursor < block.length && /\s/.test(block[cursor])) cursor += 1;

  const quote = block[cursor];
  if (quote !== '"' && quote !== "'" && quote !== "`") return html;

  let end = cursor + 1;
  while (end < block.length) {
    if (block[end] === "\\") {
      end += 2;
      continue;
    }
    if (block[end] === quote) break;
    end += 1;
  }
  if (end >= block.length) return html;

  const replacement = 'description:"🔒 本文已加密，请输入密码查看。"';
  return (
    html.slice(0, markerIndex) +
    block.slice(0, keyIndex) +
    replacement +
    block.slice(end + 1) +
    html.slice(blockEnd)
  );
}

function permalinkToFile(permalink) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(permalink).pathname);
  } catch {
    return null;
  }
  const relative = pathname.replace(/^\/+/, "");
  if (!relative) return null;
  let file = path.join(publicDir, ...relative.split("/"));
  if (pathname.endsWith("/")) file = path.join(file, "index.html");
  return file;
}

function rel(file) {
  return path.relative(cwd, file).replace(/\\/g, "/");
}

function lockPage(file, { password, hint }, frontMatter) {
  let html = fs.readFileSync(file, "utf8");
  if (html.includes("data-blog-lock")) {
    return "skipped (already locked)";
  }

  // Table of contents headings are built from the body, so encrypt them too.
  // Collect all wrappers first: the sidebar sits before the article body and
  // the mobile bar after it.
  const tocWrappers = [];
  let cursor = 0;
  while (true) {
    const open = findOpenTag(html, "div", TOC_CLASSES, cursor);
    if (!open) break;
    const close = findClosingDiv(html, open.end);
    if (close < 0) break;
    tocWrappers.push({ open, close });
    cursor = close + 6;
  }
  const tocHtml = tocWrappers.length
    ? html.slice(tocWrappers[0].open.end, tocWrappers[0].close)
    : "";

  // Replace the TOCs with placeholders before touching the body, so the
  // wrapper offsets stay valid (one wrapper follows the body in the DOM).
  for (let i = tocWrappers.length - 1; i >= 0; i -= 1) {
    const { open, close } = tocWrappers[i];
    const openingTag = html.slice(open.start, open.end);
    const tagged = openingTag.replace(/\s*>$/, " data-lock-toc>");
    html =
      html.slice(0, open.start) +
      tagged +
      '<p class="blog-lock-toc-note">目录已加密</p>' +
      html.slice(close);
  }

  // Re-locate the body: TOC edits above may have shifted its offset.
  const contentTag = findOpenTag(html, "div", CONTENT_CLASSES);
  if (!contentTag) return "skipped (no article body)";
  const contentEnd = findClosingDiv(html, contentTag.end);
  if (contentEnd < 0) return "skipped (unbalanced article body)";

  const contentHtml = html.slice(contentTag.end, contentEnd);

  const plaintext = JSON.stringify({ html: contentHtml, toc: tocHtml });
  const payload = encryptPayload(plaintext, password, hint);
  const panel = buildPanel(hint, payload);

  html = html.slice(0, contentTag.end) + panel + html.slice(contentEnd);

  // The theme writes a page description from .Summary when the post has none;
  // that would put a slice of the body inside an inline script. Minify may
  // emit the value as a double-quoted string or a template literal.
  if (!frontMatter.description) {
    html = scrubInlineDescription(html);
  }

  if (!html.includes("blog-lock.css")) {
    html = html.replace("</head>", `${ASSET_TAGS}</head>`);
  }

  fs.writeFileSync(file, html, "utf8");
  return "locked";
}

function scrubFeeds(permalinkPaths) {
  if (!permalinkPaths.length) return 0;
  let removed = 0;
  for (const file of walk(publicDir)) {
    if (!file.toLowerCase().endsWith(".xml")) continue;
    const xml = fs.readFileSync(file, "utf8");
    if (!xml.includes("<item>")) continue;
    const next = xml.replace(/<item>[\s\S]*?<\/item>\s*/g, (block) =>
      permalinkPaths.some((pathname) => block.includes(pathname)) ? "" : block,
    );
    if (next !== xml) {
      fs.writeFileSync(file, next, "utf8");
      removed += 1;
    }
  }
  return removed;
}

function scrubListExcerpts(permalinkPaths) {
  if (!permalinkPaths.length) return 0;
  let changed = 0;

  for (const file of walk(publicDir)) {
    if (!file.toLowerCase().endsWith(".html")) continue;
    let html = fs.readFileSync(file, "utf8");
    if (!html.includes("post-article")) continue;

    let dirty = false;
    for (const permalink of permalinkPaths) {
      // Only the card link counts; the same href also appears in the sidebar
      // "recent posts" widget, which has no excerpt to scrub.
      const linkRe = /<a class=(?:"post-link"|post-link)\b[^>]*>/g;
      let linkIndex = -1;
      let linkMatch;
      while ((linkMatch = linkRe.exec(html))) {
        const tag = linkMatch[0];
        if (
          tag.includes(`href="${permalink}"`) ||
          tag.includes(`href=${permalink}`)
        ) {
          linkIndex = linkMatch.index;
          break;
        }
      }
      if (linkIndex < 0) continue;

      const articleRe = /<article class=(?:"post-article"|post-article)>/g;
      articleRe.lastIndex = linkIndex;
      const open = articleRe.exec(html);
      if (!open) continue;

      // The excerpt must belong to this link, not to a later card.
      const linkEnd = linkIndex + linkMatch[0].length;
      const nextLink = html.indexOf("class=post-link", linkEnd);
      const nextQuotedLink = html.indexOf('class="post-link"', linkEnd);
      const nextBoundary = Math.min(
        ...[nextLink, nextQuotedLink].filter((index) => index >= 0),
        Number.POSITIVE_INFINITY,
      );
      if (open.index > nextBoundary) continue;

      const innerStart = open.index + open[0].length;
      const innerEnd = html.indexOf("</article>", innerStart);
      if (innerEnd < 0) continue;
      if (html.slice(innerStart, innerEnd).includes("blog-lock-note")) continue;

      html =
        html.slice(0, innerStart) +
        '<span class="blog-lock-note">🔒 本文已加密，请输入密码查看。</span>' +
        html.slice(innerEnd);
      dirty = true;
    }

    if (dirty) {
      fs.writeFileSync(file, html, "utf8");
      changed += 1;
    }
  }
  return changed;
}

function main() {
  if (!fs.existsSync(publicDir)) {
    fail(`public directory not found: ${rel(publicDir)} (run hugo first)`);
  }
  if (!fs.existsSync(contentDir)) {
    fail(`content directory not found: ${rel(contentDir)}`);
  }

  const pages = hugoPageMap();
  const lockPassword = resolveLockPassword();
  const locked = [];

  for (const source of walk(contentDir)) {
    if (!/\.(md|markdown)$/i.test(source)) continue;
    const { data } = parseFrontMatter(fs.readFileSync(source, "utf8"));
    const config = lockConfig(data);
    if (!config) continue;

    const sourceKey = path
      .relative(contentDir, source)
      .replace(/\\/g, "/");

    if (!config.isMarker) {
      fail(
        `${sourceKey} puts the password in front matter; this repository is public. ` +
          `Use \`password: true\` and set ${LOCK_ENV_NAME} in the environment or .blog-lock.env instead.`,
      );
    }
    if (!lockPassword) {
      fail(
        `${sourceKey} is locked but ${LOCK_ENV_NAME} is not set. ` +
          `Set it as a repository secret for CI and in .blog-lock.env for local builds.`,
      );
    }

    const permalink = pages.get(sourceKey);
    if (!permalink) {
      warn(`no hugo page for ${sourceKey}, skipped`);
      continue;
    }
    const file = permalinkToFile(permalink);
    if (!file || !fs.existsSync(file)) {
      warn(`${sourceKey} has no built page (draft?), skipped`);
      continue;
    }

    const status = lockPage(
      file,
      { password: lockPassword, hint: config.hint },
      data,
    );
    if (status !== "locked") {
      warn(`${sourceKey}: ${status}`);
      continue;
    }
    locked.push({ source: sourceKey, permalink, file, hasDescription: Boolean(data.description) });
    console.log(`[blog-lock] locked ${sourceKey} -> ${rel(file)}`);
  }

  const paths = locked.map((item) => new URL(item.permalink).pathname);
  const feeds = scrubFeeds(paths);
  const withoutDescription = locked.filter((item) => !item.hasDescription);
  const lists = scrubListExcerpts(
    withoutDescription.map((item) => new URL(item.permalink).pathname),
  );

  console.log(
    `[blog-lock] done: ${locked.length} locked, ${feeds} feed(s) scrubbed, ${lists} list page(s) scrubbed`,
  );
  if (withoutDescription.length) {
    warn(
      "locked posts without a description leak their summary on list pages; add `description:` to: " +
        withoutDescription.map((item) => item.source).join(", "),
    );
  }
}

main();
