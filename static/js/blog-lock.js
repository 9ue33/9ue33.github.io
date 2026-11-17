/**
 * Blog article lock — browser side.
 *
 * The build step (tools/blog-lock/encrypt.mjs) replaces a locked article body
 * with a lock panel and an AES-256-GCM ciphertext. This script asks for the
 * password, derives the key with PBKDF2-SHA256 and injects the decrypted HTML.
 *
 * The password is kept in sessionStorage so a reload in the same tab does not
 * ask again. It is gone when the tab is closed.
 */
(function () {
  "use strict";

  var STORAGE_PREFIX = "blog-lock:";
  var PANEL_SELECTOR = "[data-blog-lock]";

  function base64ToBytes(value) {
    var binary = window.atob(value);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  function decryptPayload(payload, password) {
    var subtle = window.crypto && window.crypto.subtle;
    if (!subtle) {
      return Promise.reject(new Error("webcrypto-unavailable"));
    }

    var encoder = new TextEncoder();
    return subtle
      .importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveKey"])
      .then(function (baseKey) {
        return subtle.deriveKey(
          {
            name: "PBKDF2",
            salt: base64ToBytes(payload.kdf.salt),
            iterations: payload.kdf.iterations,
            hash: payload.kdf.hash
          },
          baseKey,
          { name: "AES-GCM", length: 256 },
          false,
          ["decrypt"]
        );
      })
      .then(function (key) {
        return subtle.decrypt(
          {
            name: "AES-GCM",
            iv: base64ToBytes(payload.cipher.iv),
            tagLength: 128
          },
          key,
          base64ToBytes(payload.cipher.data)
        );
      })
      .then(function (plain) {
        return JSON.parse(new TextDecoder().decode(plain));
      });
  }

  /** Re-execute an already loaded theme script so it picks up new content. */
  function rerunScript(pattern) {
    var scripts = document.querySelectorAll("script[src]");
    for (var i = 0; i < scripts.length; i += 1) {
      var old = scripts[i];
      var src = old.getAttribute("src") || "";
      if (!pattern.test(src)) continue;
      var clone = document.createElement("script");
      for (var j = 0; j < old.attributes.length; j += 1) {
        var attr = old.attributes[j];
        clone.setAttribute(attr.name, attr.value);
      }
      old.parentNode.insertBefore(clone, old.nextSibling);
    }
  }

  function currentThemeMode() {
    try {
      return window.localStorage.getItem("dark_mode") || "auto";
    } catch (error) {
      return "auto";
    }
  }

  /** Re-apply the theme's content enhancements to the injected HTML. */
  function enhance(root) {
    if (typeof window.renderMathInElement === "function") {
      try {
        window.renderMathInElement(root, {
          delimiters: [
            { left: "$$", right: "$$", display: true },
            { left: "\\[", right: "\\]", display: true },
            { left: "$", right: "$", display: false },
            { left: "\\(", right: "\\)", display: false }
          ]
        });
        if (typeof window.katexTagOverflowHandler === "function") {
          window.katexTagOverflowHandler();
        }
      } catch (error) {
        /* math is optional */
      }
    }

    if (root.querySelector("div.highlight")) {
      rerunScript(/\/js\/insert_highlight\.js(?:[?#]|$)/);
    }
    if (root.querySelector(".tabs")) {
      rerunScript(/\/js\/tabs\.js(?:[?#]|$)/);
    }

    if (window.mermaid && root.querySelector(".mermaid")) {
      var mode = currentThemeMode();
      var isDark =
        mode === "true" ||
        (mode === "auto" &&
          window.matchMedia("(prefers-color-scheme: dark)").matches);
      document.body.dispatchEvent(
        new CustomEvent("reimu:theme-set", {
          detail: { isDark: isDark, mode: mode }
        })
      );
    }

    if (window.lazySizes && typeof window.lazySizes.init === "function") {
      window.lazySizes.init();
    }
    if (window.AOS && typeof window.AOS.refresh === "function") {
      window.AOS.refresh();
    }
  }

  function setup(panel) {
    var container = panel.closest(".e-content, .article-entry") || panel.parentElement;
    if (!container) return;

    var payloadElement = container.querySelector(".blog-lock-payload");
    if (!payloadElement) return;

    var payload;
    try {
      payload = JSON.parse(payloadElement.textContent || "{}");
    } catch (error) {
      return;
    }

    var form = panel.querySelector(".blog-lock-form");
    var input = panel.querySelector(".blog-lock-input");
    var button = panel.querySelector(".blog-lock-submit");
    var errorElement = panel.querySelector(".blog-lock-error");
    if (!form || !input || !button) return;

    var storageKey = STORAGE_PREFIX + window.location.pathname;
    var busy = false;

    function setBusy(value) {
      busy = value;
      button.disabled = value;
      button.textContent = value ? "解密中…" : "进入";
    }

    function showError(message) {
      if (!errorElement) return;
      errorElement.textContent = message || "密码错误，请重试";
      errorElement.hidden = false;
      panel.classList.remove("blog-lock-shake");
      // Force a reflow so the animation restarts on repeated failures.
      void panel.offsetWidth;
      panel.classList.add("blog-lock-shake");
      input.select();
    }

    function unlocked(data) {
      var holder = document.createElement("div");
      holder.innerHTML = data.html;

      var fragment = document.createDocumentFragment();
      while (holder.firstChild) {
        fragment.appendChild(holder.firstChild);
      }
      container.replaceChildren(fragment);

      var tocTargets = document.querySelectorAll("[data-lock-toc]");
      for (var i = 0; i < tocTargets.length; i += 1) {
        tocTargets[i].innerHTML = data.toc || "";
      }

      try {
        window.sessionStorage.setItem(storageKey, input.value);
      } catch (error) {
        /* private mode */
      }

      enhance(container);
      document.dispatchEvent(
        new CustomEvent("blog-lock:unlocked", { detail: { container: container } })
      );
    }

    function attempt(password, options) {
      var silent = Boolean(options && options.silent);
      if (busy) return;
      setBusy(true);
      if (errorElement) errorElement.hidden = true;

      decryptPayload(payload, password)
        .then(function (data) {
          unlocked(data);
        })
        .catch(function (error) {
          setBusy(false);
          if (silent) return;
          if (error && error.message === "webcrypto-unavailable") {
            showError("当前浏览器环境不支持解密，请使用 HTTPS 访问");
            return;
          }
          showError("密码错误，请重试");
        });
    }

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var password = input.value;
      if (password) attempt(password);
    });

    if (typeof payload.v !== "number" || payload.v !== 1) {
      showError("文章数据版本不兼容，请刷新页面");
      return;
    }

    var saved = null;
    try {
      saved = window.sessionStorage.getItem(storageKey);
    } catch (error) {
      saved = null;
    }
    if (saved) {
      input.value = saved;
      attempt(saved, { silent: true });
    }
  }

  function init() {
    var panels = document.querySelectorAll(PANEL_SELECTOR);
    for (var i = 0; i < panels.length; i += 1) {
      setup(panels[i]);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
