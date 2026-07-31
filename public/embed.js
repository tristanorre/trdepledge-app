/*
 * Doug — T.R. Depledge site chatbot widget.
 *
 * Single self-contained script, no dependencies, renders inside a
 * Shadow DOM so the host site's CSS can't touch it and vice-versa.
 * Talks only to the /api/enquiry endpoint via POST.
 *
 * Install (once, before </body>):
 *   <script src="/embed.js"
 *           data-endpoint="/api/enquiry"
 *           data-logo="/images/Doug.png"
 *           defer></script>
 *
 * Data attributes:
 *   data-endpoint    (required)  POST target for chat
 *   data-logo        (optional)  avatar image URL
 *   data-greeting    (optional)  override the default greeting
 *   data-auto-open   (optional)  "false" to skip the auto-open on load
 *   data-owner       (optional)  fallback contact string on errors
 */
(function () {
  // Read config off the script tag that loaded us.
  var scriptEl = document.currentScript;
  if (!scriptEl) {
    // Fallback: find our script by src if currentScript is unavailable.
    var scripts = document.getElementsByTagName("script");
    for (var i = scripts.length - 1; i >= 0; i--) {
      if (scripts[i].src && scripts[i].src.indexOf("/embed.js") !== -1) {
        scriptEl = scripts[i];
        break;
      }
    }
  }
  if (!scriptEl) return;

  var ENDPOINT = scriptEl.getAttribute("data-endpoint") || "/api/enquiry";
  var LOGO     = scriptEl.getAttribute("data-logo")     || "";
  var GREETING = scriptEl.getAttribute("data-greeting") ||
    "G'day — I'm Doug, the galah who keeps an eye on Thomas here at T.R. Depledge. Tell us what your garden or yard needs and where you are on the Yorke Peninsula, and I'll get Thomas out to sort you a quote.";
  var AUTO_OPEN = scriptEl.getAttribute("data-auto-open") !== "false";
  var OWNER    = scriptEl.getAttribute("data-owner") ||
    "Thomas on 0474 844 204 or t.rdepledge@outlook.com";

  // Bail if we've already loaded on this page — defends against a
  // careless double-include.
  if (window.__dougWidgetLoaded__) return;
  window.__dougWidgetLoaded__ = true;

  // ── Host element + shadow root ────────────────────────────────
  var host = document.createElement("div");
  host.setAttribute("id", "doug-widget");
  host.setAttribute("aria-live", "polite");
  document.body.appendChild(host);
  var root = host.attachShadow({ mode: "open" });

  var STYLE = "\
    :host, * { box-sizing: border-box; }\
    .launcher {\
      position: fixed; bottom: 20px; right: 20px; z-index: 2147483000;\
      display: inline-flex; align-items: center; gap: 10px;\
      background: #0F1B2D; color: white;\
      border-radius: 999px; padding: 8px 18px 8px 8px;\
      box-shadow: 0 10px 32px rgba(0,0,0,0.25);\
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;\
      font-size: 14px; font-weight: 700;\
      cursor: pointer; border: none; outline: none;\
      transition: transform 0.15s ease;\
    }\
    .launcher:hover { transform: translateY(-2px); }\
    .launcher-avatar {\
      width: 44px; height: 44px; border-radius: 50%; object-fit: cover;\
      background: #FFE500; border: 2px solid #FFE500;\
    }\
    .launcher-dot {\
      position: absolute; top: 6px; right: 8px;\
      width: 12px; height: 12px; border-radius: 50%;\
      background: #FFE500; border: 2px solid #0F1B2D;\
    }\
    .panel {\
      position: fixed; bottom: 20px; right: 20px; z-index: 2147483001;\
      width: 380px; max-width: calc(100vw - 24px);\
      height: 560px; max-height: calc(100vh - 40px);\
      background: #FBFAF6; border-radius: 16px; overflow: hidden;\
      display: flex; flex-direction: column;\
      box-shadow: 0 24px 60px rgba(0,0,0,0.35);\
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;\
    }\
    .panel-header {\
      background: #0F1B2D; color: white;\
      padding: 12px 14px; display: flex; align-items: center; gap: 12px;\
    }\
    .panel-avatar {\
      width: 40px; height: 40px; border-radius: 50%; object-fit: cover;\
      background: #FFE500;\
    }\
    .panel-title { font-weight: 800; font-size: 15px; line-height: 1.2; }\
    .panel-sub { font-size: 11px; color: rgba(255,255,255,0.7); letter-spacing: 0.4px; margin-top: 2px; }\
    .panel-close {\
      margin-left: auto; background: transparent; border: none;\
      color: white; font-size: 22px; cursor: pointer;\
      width: 32px; height: 32px; border-radius: 50%;\
      display: flex; align-items: center; justify-content: center;\
    }\
    .panel-close:hover { background: rgba(255,255,255,0.1); }\
    .messages {\
      flex: 1; overflow-y: auto; padding: 14px;\
      display: flex; flex-direction: column; gap: 10px;\
      background: #FBFAF6;\
    }\
    .bubble {\
      max-width: 82%; padding: 10px 14px; border-radius: 14px;\
      font-size: 14px; line-height: 1.45; word-wrap: break-word;\
      white-space: pre-wrap;\
    }\
    .bubble.user {\
      background: #0F1B2D; color: white; align-self: flex-end;\
      border-bottom-right-radius: 4px;\
    }\
    .bubble.bot {\
      background: white; color: #0F1B2D; align-self: flex-start;\
      border: 1px solid rgba(15,27,45,0.1); border-bottom-left-radius: 4px;\
    }\
    .bubble.err {\
      background: #FEE2E2; color: #991B1B; align-self: flex-start;\
      border: 1px solid #FCA5A5;\
    }\
    .typing {\
      align-self: flex-start; display: inline-flex; gap: 4px;\
      padding: 12px 14px; background: white; border-radius: 14px;\
      border: 1px solid rgba(15,27,45,0.1);\
    }\
    .typing span {\
      width: 6px; height: 6px; border-radius: 50%; background: #0F1B2D;\
      opacity: 0.4; animation: doug-blink 1.2s infinite;\
    }\
    .typing span:nth-child(2) { animation-delay: 0.2s; }\
    .typing span:nth-child(3) { animation-delay: 0.4s; }\
    @keyframes doug-blink { 0%, 60%, 100% { opacity: 0.25; } 30% { opacity: 1; } }\
    .input-row {\
      display: flex; gap: 8px; padding: 12px;\
      border-top: 1px solid rgba(15,27,45,0.08); background: white;\
    }\
    .input-row textarea {\
      flex: 1; resize: none; border: 1.5px solid rgba(15,27,45,0.15);\
      border-radius: 10px; padding: 10px 12px;\
      font-family: inherit; font-size: 14px; line-height: 1.4;\
      max-height: 100px; min-height: 40px; outline: none;\
    }\
    .input-row textarea:focus { border-color: #0F1B2D; }\
    .send {\
      background: #0F1B2D; color: white; border: none;\
      border-radius: 10px; padding: 0 16px; font-weight: 800;\
      font-size: 14px; cursor: pointer; min-height: 40px;\
    }\
    .send:disabled { opacity: 0.5; cursor: not-allowed; }\
    .hidden { display: none !important; }\
    @media (max-width: 480px) {\
      .panel {\
        width: 100vw; max-width: 100vw;\
        height: 100vh; max-height: 100vh;\
        bottom: 0; right: 0; border-radius: 0;\
      }\
    }\
  ";

  var styleEl = document.createElement("style");
  styleEl.textContent = STYLE;
  root.appendChild(styleEl);

  // ── DOM ───────────────────────────────────────────────────────
  var launcher = document.createElement("button");
  launcher.className = "launcher";
  launcher.setAttribute("aria-label", "Chat with Doug");
  launcher.innerHTML =
    (LOGO ? '<img class="launcher-avatar" src="' + escAttr(LOGO) + '" alt="Doug">' : '<div class="launcher-avatar" style="display:flex;align-items:center;justify-content:center;color:#0F1B2D;font-size:22px;">🦜</div>') +
    '<span>Chat with Doug</span>' +
    '<span class="launcher-dot"></span>';

  var panel = document.createElement("div");
  panel.className = "panel hidden";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Doug chat");
  panel.innerHTML =
    '<div class="panel-header">' +
      (LOGO ? '<img class="panel-avatar" src="' + escAttr(LOGO) + '" alt="Doug">' : '<div class="panel-avatar" style="display:flex;align-items:center;justify-content:center;font-size:20px">🦜</div>') +
      '<div>' +
        '<div class="panel-title">Doug</div>' +
        '<div class="panel-sub">T.R. DEPLEDGE · I SUPERVISE THOMAS</div>' +
      '</div>' +
      '<button class="panel-close" aria-label="Close chat">×</button>' +
    '</div>' +
    '<div class="messages" role="log"></div>' +
    '<div class="input-row">' +
      '<textarea placeholder="Tell Doug what your garden needs..." rows="1"></textarea>' +
      '<button class="send" type="button">Send</button>' +
    '</div>';

  root.appendChild(launcher);
  root.appendChild(panel);

  var messagesEl = panel.querySelector(".messages");
  var textarea   = panel.querySelector("textarea");
  var sendBtn    = panel.querySelector(".send");
  var closeBtn   = panel.querySelector(".panel-close");

  // ── State ─────────────────────────────────────────────────────
  var conversation = [];    // [{role, content}] sent to /api/enquiry
  var capture      = {};    // running captured lead state
  var isBusy       = false;
  var isOpen       = false;
  var hasGreeted   = false;

  function open() {
    if (isOpen) return;
    isOpen = true;
    panel.classList.remove("hidden");
    launcher.classList.add("hidden");
    if (!hasGreeted) {
      hasGreeted = true;
      addBotMessage(GREETING);
    }
    setTimeout(function () { textarea.focus(); }, 50);
  }
  function close() {
    isOpen = false;
    panel.classList.add("hidden");
    launcher.classList.remove("hidden");
  }
  launcher.addEventListener("click", open);
  closeBtn.addEventListener("click", close);

  function addBubble(text, kind) {
    var b = document.createElement("div");
    b.className = "bubble " + kind;
    b.textContent = text;
    messagesEl.appendChild(b);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return b;
  }
  function addBotMessage(text) { return addBubble(text, "bot"); }
  function addUserMessage(text) { return addBubble(text, "user"); }
  function addError(text) { return addBubble(text, "err"); }

  function showTyping() {
    var t = document.createElement("div");
    t.className = "typing";
    t.innerHTML = "<span></span><span></span><span></span>";
    messagesEl.appendChild(t);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return t;
  }

  function sendMessage() {
    if (isBusy) return;
    var text = (textarea.value || "").trim();
    if (!text) return;
    textarea.value = "";
    autoresize();

    addUserMessage(text);
    conversation.push({ role: "user", content: text });

    isBusy = true;
    sendBtn.disabled = true;
    var typingEl = showTyping();

    fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // `page` tells the server which Doug to be: behind the hire counter
      // on /hire, taking gardening enquiries everywhere else. Cosmetic and
      // untrusted — both modes only reach read-only tools.
      body: JSON.stringify({
        messages: conversation,
        capture: capture,
        page: location.pathname,
      }),
    })
      .then(function (res) {
        if (!res.ok) throw new Error("http_" + res.status);
        return res.json();
      })
      .then(function (data) {
        typingEl.remove();
        if (data && data.reply) {
          addBotMessage(data.reply);
          conversation.push({ role: "assistant", content: data.reply });
        }
        if (data && data.capture) capture = data.capture;
        if (data && data.handoff) handoff(data.handoff);
      })
      .catch(function (err) {
        typingEl.remove();
        console.error("[Doug widget]", err);
        addError("Sorry — I couldn't reach us right now. You can reach " + OWNER + ".");
      })
      .then(function () {
        isBusy = false;
        sendBtn.disabled = false;
        textarea.focus();
      });
  }

  sendBtn.addEventListener("click", sendMessage);
  textarea.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  textarea.addEventListener("input", autoresize);
  function autoresize() {
    textarea.style.height = "auto";
    textarea.style.height = Math.min(100, textarea.scrollHeight) + "px";
  }

  if (AUTO_OPEN) {
    setTimeout(open, 500);
  }

  // ── Hire handoff ─────────────────────────────────────────────
  //
  // On the hire page Doug can fill the booking form in with the tool and
  // dates he's just agreed, so the customer isn't made to pick them twice.
  // The widget lives in a shadow root and knows nothing about the page, so
  // it dispatches an event and lets the page act on it.
  //
  // This does NOT book anything. The customer still types their own name,
  // mobile and email, and presses "Send booking request" themselves.
  var HANDOFF_EVENT = "doug:hire-prefill";

  function handoff(detail) {
    try {
      window.dispatchEvent(new CustomEvent(HANDOFF_EVENT, { detail: detail }));
    } catch (e) {
      // A browser without CustomEvent, or a page with no listener — the
      // chat still told them the dates, so this is a lost convenience,
      // not a lost booking. Never let it break the conversation.
      console.warn("[Doug widget] handoff not delivered", e);
      return;
    }
    // Get out of the way: on a phone the panel is full-screen, so the form
    // we've just scrolled to would be behind it.
    if (window.matchMedia && window.matchMedia("(max-width: 480px)").matches) close();
  }

  // ── Utilities ────────────────────────────────────────────────
  function escAttr(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }
})();
