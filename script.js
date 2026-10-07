/* =========================================================
   Aftab Ansari AI – script.js
   1 Configuration · 2 DOM elements · 3 State · 4 Event listeners
   5 Chat functions · 6 API function · 7 Demo mode
   8 Utility functions · 9 Initialization
   ========================================================= */
"use strict";

/* ---------- 1. CONFIGURATION ---------- */
const CONFIG = {
  // >>> PUT YOUR BACKEND ENDPOINT HERE, e.g. "https://api.yourdomain.com/chat"
  // While this is empty, the chatbot runs in DEMO MODE (local fake answers).
  API_URL: "http://localhost:3000/api/chat",

  // SECURITY: Never expose production API keys in frontend JavaScript.
  // Anyone can open DevTools and read this file. Keep real keys on your
  // backend/server-side proxy, and let the frontend call only that proxy.
  // Leave this empty unless your backend needs a public, low-privilege token.
  API_KEY: "",

  REQUEST_TIMEOUT_MS: 30000,   // stop waiting for the backend after 30 s
  MAX_HISTORY: 10,             // how many previous messages are sent to the backend
  MAX_CHARS: 2000,             // keep equal to maxlength in index.html
  DEMO_DELAY_MIN: 800,         // fake "thinking" time in demo mode (ms)
  DEMO_DELAY_MAX: 1400
};

/* ---------- 2. DOM ELEMENTS ---------- */
const $ = (id) => document.getElementById(id);

const chatScroll  = $("chat-scroll");
const welcomeEl   = $("welcome");
const messagesEl  = $("messages");
const composerEl  = $("composer");
const inputEl     = $("input");
const sendBtn     = $("send-btn");
const counterEl   = $("counter");
const attachBtn   = $("attach-btn");
const micBtn      = $("mic-btn");
const newChatBtn  = $("new-chat-btn");
const menuBtn     = $("menu-btn");
const menuEl      = $("menu");
const clearBtn    = $("clear-btn");
const modeLabel   = $("mode-label");
const toastEl     = $("toast");
const dialogEl    = $("confirm-dialog");

const SVG_NS = "http://www.w3.org/2000/svg";

/* ---------- 3. STATE ---------- */
const state = {
  messages: [],        // [{ role: "user" | "ai", text, time }]
  busy: false,         // true while waiting for an AI reply
  session: 0,          // increases on every New Chat / Clear, so late replies can be ignored
  recognition: null,   // speech recognition instance (microphone)
  toastTimer: null
};

/* ---------- 4. EVENT LISTENERS ---------- */
composerEl.addEventListener("submit", (e) => { e.preventDefault(); sendMessage(); });

inputEl.addEventListener("input", () => { resizeInput(); updateComposer(); });

// Enter = send, Shift + Enter = new line
inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    sendMessage();
  }
});

// Suggestion cards on the welcome screen send their question automatically
document.querySelectorAll(".card").forEach((card) => {
  card.addEventListener("click", () => sendMessage(card.dataset.prompt));
});

newChatBtn.addEventListener("click", () => { clearConversation(); inputEl.focus(); });
clearBtn.addEventListener("click", () => { toggleMenu(false); askToClear(); });
menuBtn.addEventListener("click", (e) => { e.stopPropagation(); toggleMenu(menuEl.hidden); });
document.addEventListener("click", (e) => { if (!menuEl.hidden && !menuEl.contains(e.target)) toggleMenu(false); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !menuEl.hidden) { toggleMenu(false); menuBtn.focus(); } });

attachBtn.addEventListener("click", () => showToast("File attachments will be available once the backend supports them."));
micBtn.addEventListener("click", toggleMic);

dialogEl.addEventListener("close", () => {
  if (dialogEl.returnValue === "confirm") { clearConversation(); showToast("Chat cleared"); }
});

/* ---------- 5. CHAT FUNCTIONS ---------- */

// Reads the input (or a preset question from a card/chip), shows it, then asks for a reply
async function sendMessage(presetText) {
  const text = (presetText ?? inputEl.value).trim();
  if (!text || state.busy) return;

  inputEl.value = "";
  resizeInput();
  updateComposer();

  addMessage("user", text);
  await requestReply(text);
}

// Shows the typing dots, gets the reply, then shows it
async function requestReply(userText) {
  const session = state.session;
  setBusy(true);
  const typing = showTyping();

  let reply;
  try {
    reply = await getAIResponse(userText);
  } catch (error) {
    console.error("AI request failed:", error);
    reply = "Sorry, I couldn't get a response right now. Please try again in a moment.";
  }

  if (session !== state.session) return;   // chat was cleared meanwhile: drop this reply
  typing.remove();
  addMessage("ai", reply);
  setBusy(false);
  if (document.activeElement === document.body) inputEl.focus();
}

// Adds one message to the state and to the screen. role: "user" | "ai"
function addMessage(role, text) {
  const time = new Date();
  state.messages.push({ role, text, time });

  const row = document.createElement("article");
  row.className = "msg " + role;

  const main = document.createElement("div");
  main.className = "msg-main";

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  if (role === "ai") renderRichText(bubble, text);   // safe markdown-like rendering
  else bubble.textContent = text;                    // user text is never parsed as HTML

  const meta = document.createElement("div");
  meta.className = "meta";
  const stamp = document.createElement("span");
  stamp.textContent = (role === "user" ? "You" : "Aftab Ansari AI") + " · " + formatTime(time);
  meta.appendChild(stamp);

  if (role === "ai") {
    meta.appendChild(createActionButton("Copy", "i-copy", "copy-btn", async (btn, label) => {
      const ok = await copyText(text);
      label.textContent = ok ? "Copied ✓" : "Copy failed";
      setTimeout(() => { label.textContent = "Copy"; }, 1800);
    }));
    meta.appendChild(createActionButton("Regenerate", "i-refresh", "regen-btn", regenerate));
  }

  main.append(bubble, meta);
  row.append(createAvatar(role), main);
  messagesEl.appendChild(row);

  updateView();
  updateRegenerate();
  scrollToBottom();
  return row;
}

// Animated "AI is typing" row (three dots)
function showTyping() {
  const row = document.createElement("div");
  row.className = "msg ai";

  const bubble = document.createElement("div");
  bubble.className = "bubble typing-bubble";
  const hidden = document.createElement("span");
  hidden.className = "sr-only";
  hidden.textContent = "Aftab Ansari AI is typing";
  bubble.appendChild(hidden);
  for (let i = 0; i < 3; i++) {
    const dot = document.createElement("span");
    dot.className = "t-dot";
    bubble.appendChild(dot);
  }

  const main = document.createElement("div");
  main.className = "msg-main";
  main.appendChild(bubble);
  row.append(createAvatar("ai"), main);

  messagesEl.appendChild(row);
  updateRegenerate();
  scrollToBottom();
  return row;
}

// Replaces the latest AI answer with a new one
function regenerate() {
  if (state.busy) return;
  const last = state.messages[state.messages.length - 1];
  if (!last || last.role !== "ai") return;
  const lastUser = [...state.messages].reverse().find((m) => m.role === "user");
  if (!lastUser) return;

  state.messages.pop();
  messagesEl.lastElementChild.remove();
  requestReply(lastUser.text);
}

// New Chat / Clear: wipe everything and go back to the welcome screen
function clearConversation() {
  state.session++;
  state.messages = [];
  state.busy = false;
  messagesEl.replaceChildren();
  updateView();
  updateComposer();
}

// "Clear chat" asks for confirmation first
function askToClear() {
  if (state.messages.length === 0) { showToast("Nothing to clear yet."); return; }
  if (typeof dialogEl.showModal === "function") dialogEl.showModal();
  else if (window.confirm("Clear this conversation?")) clearConversation();
}

// Show the welcome screen when there are no messages, otherwise the conversation
function updateView() {
  const empty = state.messages.length === 0;
  welcomeEl.hidden = !empty;
  messagesEl.hidden = empty;
}

// Only the very last AI message gets a Regenerate button
function updateRegenerate() {
  messagesEl.querySelectorAll(".regen-btn").forEach((btn) => {
    btn.hidden = btn.closest(".msg") !== messagesEl.lastElementChild;
  });
}

function setBusy(value) {
  state.busy = value;
  updateComposer();
}

// Send button + character counter
function updateComposer() {
  const length = inputEl.value.length;
  sendBtn.disabled = inputEl.value.trim() === "" || state.busy;
  counterEl.textContent = length + " / " + CONFIG.MAX_CHARS;
  counterEl.classList.toggle("warn", length > CONFIG.MAX_CHARS * 0.9);
}

// Textarea grows with its content (max height is set in CSS)
function resizeInput() {
  inputEl.style.height = "auto";
  inputEl.style.height = inputEl.scrollHeight + "px";
}

function toggleMenu(open) {
  menuEl.hidden = !open;
  menuBtn.setAttribute("aria-expanded", String(open));
}

// Voice input using the browser's Speech Recognition (Chrome/Edge/Safari)
function toggleMic() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) { showToast("Voice input isn't supported in this browser."); return; }
  if (state.recognition) { state.recognition.stop(); return; }

  const rec = new SpeechRecognition();
  rec.lang = "en-US";
  rec.interimResults = false;
  rec.onresult = (e) => {
    const spoken = e.results[0][0].transcript;
    inputEl.value = (inputEl.value + " " + spoken).trim().slice(0, CONFIG.MAX_CHARS);
    resizeInput();
    updateComposer();
  };
  rec.onerror = () => showToast("Couldn't hear that. Please try again.");
  rec.onend = () => {
    state.recognition = null;
    micBtn.classList.remove("is-listening");
    micBtn.setAttribute("aria-pressed", "false");
  };

  try {
    rec.start();
    state.recognition = rec;
    micBtn.classList.add("is-listening");
    micBtn.setAttribute("aria-pressed", "true");
  } catch (err) {
    showToast("Couldn't start the microphone.");
  }
}

/* ---------- 6. API FUNCTION ----------
   getAIResponse() is the ONLY function the chat UI calls to get an answer.
   - API_URL empty  -> DEMO MODE (local fake answers)
   - API_URL filled -> your backend is called                              */
async function getAIResponse(userMessage) {
  if (!CONFIG.API_URL) return getDemoResponse(userMessage);   // DEMO MODE
  return callBackendAPI(userMessage);
}

async function callBackendAPI(userMessage) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT_MS);

  const headers = { "Content-Type": "application/json" };
  if (CONFIG.API_KEY) headers["Authorization"] = "Bearer " + CONFIG.API_KEY;

  try {
    const response = await fetch(CONFIG.API_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(buildRequestBody(userMessage)),
      signal: controller.signal
    });
    if (!response.ok) throw new Error("Backend returned status " + response.status);

    const isJson = (response.headers.get("content-type") || "").includes("application/json");
    const data = isJson ? await response.json() : await response.text();
    return extractReply(data);
  } finally {
    clearTimeout(timer);
  }
}

// What we send to the backend. CHANGE THIS if your backend expects other field names.
function buildRequestBody(userMessage) {
  const past = state.messages.slice();
  if (past.length && past[past.length - 1].role === "user") past.pop();   // current question is sent separately

  return {
    message: userMessage,
    history: past.slice(-CONFIG.MAX_HISTORY).map((m) => ({
      role: m.role === "ai" ? "assistant" : "user",
      content: m.text
    }))
  };
}

// How we read the backend answer. It tries common field names, so small format
// changes won't break the UI. Add your own field here if your backend differs.
function extractReply(data) {
  if (typeof data === "string" && data.trim()) return data.trim();

  const candidates = [
    data?.reply, data?.response, data?.answer, data?.message, data?.text,
    data?.output, data?.result, data?.data?.reply, data?.choices?.[0]?.message?.content
  ];
  const found = candidates.find((value) => typeof value === "string" && value.trim());
  if (found) return found.trim();

  throw new Error("Unrecognized response format from backend");
}

/* ---------- 7. DEMO MODE ----------
   DEMO MODE: these answers are fake and local. They are used only while
   CONFIG.API_URL is empty. The first rule that matches the question wins. */
const DEMO_RULES = [
  {
    test: /^\s*(hi|hello|hey|salam|namaste)\b/i,
    reply: "Hello! 👋 I'm **Aftab Ansari AI**.\n\nAsk me about Linux, AWS, DevOps, networking or career guidance."
  },
  {
    test: /aftab|who (are|made|built|created) (you|this)|about (you|him)|creator/i,
    reply: "**Aftab Ansari** is a technology professional focused on **Linux • AWS • DevOps • Networking**.\n\nThis assistant is his personal AI project. It is currently running in demo mode, so detailed answers about his work will appear once it is connected to its backend."
  },
  {
    test: /career|job|salary|roadmap|certif|interview|resume/i,
    reply: "**Starting a career in Linux, AWS and DevOps**\n\n1. Learn Linux fundamentals: shell, users, permissions, services\n2. Understand networking basics: IP, DNS, ports, firewalls\n3. Pick up core AWS services: EC2, S3, IAM, VPC\n4. Practice automation with Git, Bash, Docker and CI/CD\n5. Build small projects and document them\n\nConsistent hands-on practice matters more than collecting certificates."
  },
  {
    test: /network|dns|subnet|\bip\b|tcp|firewall|router|http/i,
    reply: "**Networking basics**\n\n• **IP address**: the unique address of a device on a network\n• **DNS**: translates names like `example.com` into IP addresses\n• **Subnet**: a smaller section of a network, e.g. `10.0.1.0/24`\n• **Ports**: doors for services, e.g. 22 for SSH and 443 for HTTPS\n\nA handy first command to try:\n```bash\nping -c 4 example.com\n```"
  },
  {
    test: /aws|amazon|cloud|ec2|\bs3\b|\biam\b|vpc/i,
    reply: "**Getting started with AWS and cloud**\n\n• **EC2**: virtual servers\n• **S3**: object storage for files\n• **IAM**: users, roles and permissions\n• **VPC**: your private network in the cloud\n\nStart with the free tier, launch a Linux server on EC2, and deploy something small. Hands-on practice is the fastest way to learn."
  },
  {
    test: /linux|ubuntu|bash|shell|kernel|terminal/i,
    reply: "**Linux** is an open-source operating system widely used in servers, cloud infrastructure and DevOps environments.\n\nIt matters for DevOps because most cloud servers, containers and CI/CD tools run on Linux. A few commands to start with:\n```bash\nls -la\nsudo systemctl status nginx\n```"
  },
  {
    test: /devops|ci\/cd|docker|kubernetes|pipeline|jenkins|terraform/i,
    reply: "**DevOps** combines development and operations practices to build, test and release software faster and more reliably.\n\nCommon pieces:\n• Version control with Git\n• CI/CD pipelines\n• Containers such as Docker\n• Infrastructure as code\n• Monitoring and logging"
  }
];

const DEMO_FALLBACK = "I'm in **demo mode**, so I can only answer a few topics right now.\n\nTry asking about:\n• Linux\n• AWS\n• DevOps\n• Networking\n• Career guidance\n• Aftab Ansari";

async function getDemoResponse(userMessage) {
  const delay = CONFIG.DEMO_DELAY_MIN + Math.random() * (CONFIG.DEMO_DELAY_MAX - CONFIG.DEMO_DELAY_MIN);
  await sleep(delay);
  const rule = DEMO_RULES.find((r) => r.test.test(userMessage));
  return rule ? rule.reply : DEMO_FALLBACK;
}

/* ---------- 8. UTILITY FUNCTIONS ---------- */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function formatTime(date) {
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function scrollToBottom() {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  chatScroll.scrollTo({ top: chatScroll.scrollHeight, behavior: reduce ? "auto" : "smooth" });
}

function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.add("show");
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2400);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    // Fallback for older browsers / non-secure pages
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
    area.remove();
    return ok;
  }
}

function createIcon(id) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "icon");
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS(SVG_NS, "use");
  use.setAttribute("href", "#" + id);
  svg.appendChild(use);
  return svg;
}

function createAvatar(role) {
  const el = document.createElement("div");
  el.setAttribute("aria-hidden", "true");
  if (role === "ai") {
    el.className = "ai-orb ai-orb-sm";
    const core = document.createElement("span");
    core.className = "ai-core";
    el.appendChild(core);
  } else {
    el.className = "avatar-user";
    el.appendChild(createIcon("i-user"));
  }
  return el;
}

function createActionButton(label, iconId, extraClass, onClick) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "act-btn " + extraClass;
  btn.appendChild(createIcon(iconId));
  const text = document.createElement("span");
  text.textContent = label;
  btn.appendChild(text);
  btn.addEventListener("click", () => onClick(btn, text));
  return btn;
}

/* Markdown-like rendering WITHOUT innerHTML: every piece of text goes in through
   textContent / createTextNode, so no HTML from a reply can ever run.
   Supported: **bold**, `inline code`, ```code blocks```, "- " / "• " lists,
   "1." lists, and "# " headings. */
function renderRichText(container, text) {
  text.split("```").forEach((part, index) => {
    if (index % 2 === 1) {                       // odd parts are code blocks
      const pre = document.createElement("pre");
      const code = document.createElement("code");
      code.textContent = part.replace(/^[\w+-]*\n/, "").replace(/\n$/, "");
      pre.appendChild(code);
      container.appendChild(pre);
    } else {
      renderBlocks(container, part);
    }
  });
}

function renderBlocks(container, text) {
  let list = null;
  text.split("\n").forEach((rawLine) => {
    const line = rawLine.trimEnd();
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);

    if (bullet || numbered) {
      const tag = bullet ? "ul" : "ol";
      if (!list || list.tagName.toLowerCase() !== tag) {
        list = document.createElement(tag);
        container.appendChild(list);
      }
      const li = document.createElement("li");
      appendInline(li, (bullet || numbered)[1]);
      list.appendChild(li);
      return;
    }

    list = null;
    if (!line.trim()) return;
    const heading = line.match(/^#{1,3}\s+(.*)$/);
    const block = document.createElement(heading ? "h4" : "p");
    appendInline(block, heading ? heading[1] : line);
    container.appendChild(block);
  });
}

function appendInline(parent, text) {
  text.split(/(\*\*[^*]+\*\*|`[^`]+`)/).forEach((token) => {
    if (!token) return;
    if (token.length > 4 && token.startsWith("**") && token.endsWith("**")) {
      const strong = document.createElement("strong");
      strong.textContent = token.slice(2, -2);
      parent.appendChild(strong);
    } else if (token.length > 2 && token.startsWith("`") && token.endsWith("`")) {
      const code = document.createElement("code");
      code.textContent = token.slice(1, -1);
      parent.appendChild(code);
    } else {
      parent.appendChild(document.createTextNode(token));
    }
  });
}

/* ---------- 9. INITIALIZATION ---------- */
function init() {
  modeLabel.textContent = CONFIG.API_URL ? "Live (backend)" : "Demo";
  updateView();
  updateComposer();
}

init();
