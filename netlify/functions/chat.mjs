import { marked } from "https://cdn.jsdelivr.net/npm/marked@15.0.6/+esm";
import katex from "https://cdn.jsdelivr.net/npm/katex@0.16.21/+esm";
import DOMPurify from "https://cdn.jsdelivr.net/npm/dompurify@3.2.4/+esm";

import "https://cdn.jsdelivr.net/npm/katex@0.16.21/dist/katex.min.css";

marked.setOptions({
  gfm: true,
  breaks: true,
});

const API_URL = "/api/chat";

const state = {
  messages: [],
  voices: [],
  isLoading: false,
};

const elements = {
  form: document.querySelector("#chat-form"),
  input: document.querySelector("#user-input"),
  sendButton: document.querySelector("#send-button"),
  messages: document.querySelector("#chat-messages"),
  sourceList: document.querySelector("#source-list"),
  sourcePanel: document.querySelector("#source-panel"),
  status: document.querySelector("#status-text"),
  stopSpeech: document.querySelector("#stop-speech"),
  forceSources: document.querySelector("#force-sources"),
};

function setStatus(text = "") {
  if (elements.status) {
    elements.status.textContent = text;
  }
}

function setLoading(isLoading) {
  state.isLoading = isLoading;

  if (elements.sendButton) {
    elements.sendButton.disabled = isLoading;
    elements.sendButton.textContent = isLoading ? "Válasz készül…" : "Küldés";
  }

  if (elements.input) {
    elements.input.disabled = isLoading;
  }
}

function scrollToBottom() {
  requestAnimationFrame(() => {
    window.scrollTo({
      top: document.documentElement.scrollHeight,
      behavior: "smooth",
    });
  });
}

function saveMessages() {
  try {
    localStorage.setItem(
      "ai-chat-history",
      JSON.stringify(state.messages.slice(-30)),
    );
  } catch {
    // Ha a localStorage nem elérhető, a chat ettől még működik.
  }
}

function loadMessages() {
  try {
    const saved = localStorage.getItem("ai-chat-history");

    if (!saved) {
      return;
    }

    const parsed = JSON.parse(saved);

    if (Array.isArray(parsed)) {
      state.messages = parsed;
    }
  } catch {
    state.messages = [];
  }
}

function createMessage(role, content) {
  return {
    id: crypto.randomUUID(),
    role,
    content,
  };
}

function escapeLatexPlaceholders(text) {
  const formulas = [];

  const storeFormula = (formula, displayMode) => {
    const placeholder = `@@FORMULA_${formulas.length}@@`;

    const html = katex.renderToString(formula.trim(), {
      displayMode,
      throwOnError: false,
      strict: "ignore",
      trust: false,
    });

    formulas.push({
      placeholder,
      html,
    });

    return placeholder;
  };

  let result = String(text || "");

  result = result.replace(/$$([sS]*?)$$/g, (_, formula) => {
    return storeFormula(formula, true);
  });

  result = result.replace(/\\[([sS]*?)\\]/g, (_, formula) => {
    return storeFormula(formula, true);
  });

  result = result.replace(/\\(([sS]*?)\\)/g, (_, formula) => {
    return storeFormula(formula, false);
  });

  result = result.replace(/(^|[^\\$])$([^$
]+?)$(?!$)/g, (_, before, formula) => {
    return `${before}${storeFormula(formula, false)}`;
  });

  return {
    text: result,
    formulas,
  };
}

function renderMarkdownAndLatex(rawText) {
  const { text, formulas } = escapeLatexPlaceholders(rawText);

  let html = marked.parse(text);

  for (const formula of formulas) {
    html = html.replaceAll(formula.placeholder, formula.html);
  }

  return DOMPurify.sanitize(html, {
    ADD_ATTR: ["target", "rel", "class", "aria-hidden"],
  });
}

function cleanTextForSpeech(rawText) {
  return String(rawText || "")
    .replace(/```[sS]*?```/g, " kódblokk ")
    .replace(/$$[sS]*?$$/g, " képlet ")
    .replace(/\\[[sS]*?\\]/g, " képlet ")
    .replace(/\\([sS]*?\\)/g, " képlet ")
    .replace(/(^|[^\\$])$([^$
]+?)$(?!$)/g, "$1 képlet ")
    .replace(/[([^]]+)]([^)]+)/g, "$1")
    .replace(/#{1,6}s+/g, "")
    .replace(/[*_~>`]/g, "")
    .replace(/s+/g, " ")
    .trim();
}

function splitSpeechText(text, maxLength = 220) {
  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];
  const parts = [];
  let current = "";

  for (const sentence of sentences) {
    const candidate = `${current} ${sentence}`.trim();

    if (candidate.length > maxLength && current) {
      parts.push(current.trim());
      current = sentence.trim();
    } else {
      current = candidate;
    }
  }

  if (current.trim()) {
    parts.push(current.trim());
  }

  return parts;
}

function loadVoices() {
  if (!("speechSynthesis" in window)) {
    return [];
  }

  state.voices = window.speechSynthesis.getVoices();
  return state.voices;
}

function getHungarianVoice() {
  const voices = state.voices.length ? state.voices : loadVoices();

  return (
    voices.find((voice) => voice.lang?.toLowerCase() === "hu-hu") ||
    voices.find((voice) => voice.lang?.toLowerCase().startsWith("hu")) ||
    voices.find((voice) => voice.default) ||
    voices[0] ||
    null
  );
}

function stopSpeech() {
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}

async function speakText(rawText) {
  if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
    setStatus("Ebben a böngészőben nem támogatott a felolvasás.");
    return;
  }

  stopSpeech();

  const text = cleanTextForSpeech(rawText);

  if (!text) {
    setStatus("Nincs felolvasható szöveg.");
    return;
  }

  const voice = getHungarianVoice();
  const chunks = splitSpeechText(text);

  setStatus("Felolvasás folyamatban…");

  for (const chunk of chunks) {
    await new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(chunk);

      utterance.lang = voice?.lang || "hu-HU";
      utterance.rate = 1;
      utterance.pitch = 1;
      utterance.volume = 1;

      if (voice) {
        utterance.voice = voice;
      }

      utterance.onend = resolve;
      utterance.onerror = resolve;

      window.speechSynthesis.speak(utterance);
    });
  }

  setStatus("A felolvasás befejeződött.");
}

function sourceSearchRecommended(text) {
  const keywords = [
    "forrás",
    "források",
    "hivatkozás",
    "kutatás",
    "tanulmány",
    "tudományos",
    "cikk",
    "bizonyíték",
    "aktuális",
    "legújabb",
    "statisztika",
    "egészség",
    "orvosi",
    "jogi",
    "törvény",
    "pénzügyi",
    "történelmi",
  ];

  const lowerText = String(text || "").toLocaleLowerCase("hu-HU");

  return keywords.some((word) => lowerText.includes(word));
}

function createMessageElement(message) {
  const article = document.createElement("article");
  article.className = `message ${message.role}`;

  const top = document.createElement("div");
  top.className = "message-meta";

  const role = document.createElement("span");
  role.textContent = message.role === "user" ? "Te" : "AI asszisztens";

  const actions = document.createElement("div");
  actions.className = "message-tools";

  const copyButton = document.createElement("button");
  copyButton.type = "button";
  copyButton.textContent = "Másolás";

  copyButton.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setStatus("A válasz a vágólapra került.");
    } catch {
      setStatus("A másolás nem sikerült.");
    }
  });

  actions.appendChild(copyButton);

  if (message.role === "assistant") {
    const speechButton = document.createElement("button");
    speechButton.type = "button";
    speechButton.textContent = "Felolvasás";

    speechButton.addEventListener("click", () => {
      speakText(message.content);
    });

    actions.appendChild(speechButton);
  }

  top.append(role, actions);

  const content = document.createElement("div");
  content.className = "message-content";
  content.innerHTML = renderMarkdownAndLatex(message.content);

  content.querySelectorAll("a").forEach((link) => {
    link.target = "_blank";
    link.rel = "noopener noreferrer";
  });

  article.append(top, content);

  return article;
}

function renderAllMessages() {
  elements.messages.innerHTML = "";

  if (!state.messages.length) {
    elements.messages.innerHTML = `
      <div class="empty-state">
        <h2>Üdv a chatben</h2>
        <p>
          Kérdezhetsz tananyagokról, kérhetsz LaTeX-képleteket,
          forrásokat és felolvasást.
        </p>
      </div>
    `;

    return;
  }

  for (const message of state.messages) {
    elements.messages.appendChild(createMessageElement(message));
  }

  scrollToBottom();
}

function showSources(sources = []) {
  if (!elements.sourcePanel || !elements.sourceList) {
    return;
  }

  if (!sources.length) {
    elements.sourcePanel.classList.add("hidden");
    elements.sourceList.innerHTML = "";
    return;
  }

  elements.sourcePanel.classList.remove("hidden");
  elements.sourceList.innerHTML = "";

  for (const source of sources) {
    const card = document.createElement("article");
    card.className = "source-card";

    const title = document.createElement("h3");
    title.textContent = source.title || "Cím nélküli forrás";

    const details = document.createElement("p");

    const authors = Array.isArray(source.authors) && source.authors.length
      ? source.authors.join(", ")
      : "Ismeretlen szerző";

    const year = source.year || "n. a.";
    const journal = source.journal ? ` · ${source.journal}` : "";
    const citations = source.citedByCount ?? 0;

    details.textContent =
      `${authors} · ${year}${journal} · Idézettség: ${citations}`;

    card.append(title, details);

    if (source.url) {
      const link = document.createElement("a");
      link.href = source.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = source.doi || source.url;

      card.appendChild(link);
    }

    elements.sourceList.appendChild(card);
  }
}

function createLoadingMessage() {
  const article = document.createElement("article");
  article.className = "message assistant loading";

  article.innerHTML = `
    <div class="message-meta">
      <span>AI asszisztens</span>
    </div>
    <div class="message-content">
      Válasz és források előkészítése…
    </div>
  `;

  elements.messages.appendChild(article);

  return article;
}

async function sendMessage(userText) {
  if (!userText || state.isLoading) {
    return;
  }

  stopSpeech();

  const userMessage = createMessage("user", userText);

  state.messages.push(userMessage);
  saveMessages();
  renderAllMessages();

  elements.input.value = "";
  setLoading(true);

  const mustUseSources =
    Boolean(elements.forceSources?.checked) ||
    sourceSearchRecommended(userText);

  setStatus(
    mustUseSources
      ? "Válasz és hiteles források keresése folyamatban…"
      : "Válasz készítése folyamatban…",
  );

  const loadingElement = createLoadingMessage();
  scrollToBottom();

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: state.messages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
        forceSources: mustUseSources,
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(data.error || "Nem sikerült választ kapni a szervertől.");
    }

    loadingElement.remove();

    const assistantMessage = createMessage(
      "assistant",
      data.answer || "Nem érkezett értelmezhető válasz.",
    );

    state.messages.push(assistantMessage);
    saveMessages();

    elements.messages.appendChild(createMessageElement(assistantMessage));

    showSources(data.sources || []);

    if (data.usedSourceSearch) {
      setStatus(`${data.sources?.length || 0} forrás feldolgozva.`);
    } else {
      setStatus("A válasz elkészült.");
    }
  } catch (error) {
    console.error(error);

    loadingElement.remove();

    const errorMessage = createMessage(
      "assistant",
      `## Hiba történt

${error.message}`,
    );

    state.messages.push(errorMessage);
    saveMessages();

    elements.messages.appendChild(createMessageElement(errorMessage));

    setStatus("A válasz létrehozása sikertelen.");
  } finally {
    setLoading(false);
    elements.input.focus();
    scrollToBottom();
  }
}

function initialize() {
  loadMessages();
  renderAllMessages();

  if ("speechSynthesis" in window) {
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
  }

  elements.form?.addEventListener("submit", (event) => {
    event.preventDefault();

    const text = elements.input.value.trim();

    sendMessage(text);
  });

  elements.input?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      elements.form.requestSubmit();
    }
  });

  elements.stopSpeech?.addEventListener("click", () => {
    stopSpeech();
    setStatus("A felolvasás leállítva.");
  });
}

initialize();
