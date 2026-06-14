// ===============================
// AMISEARCH 2026 – CLIENT CHAT ENGINE
// STREAM PARSING & AUTOMATIC SUPABASE CHART GENERATION
// ===============================

const chatContainer = document.getElementById("chatMessages");
const userInput = document.getElementById("userInput");
const sendButton = document.getElementById("sendButton");

// Supabase kliens inicializálása (Helyettesítsd a sajátoddal, ha szükséges)
const supabaseUrl = '[https://rvgzvseejzbzmcqidnzc.supabase.co](https://rvgzvseejzbzmcqidnzc.supabase.co)';
const supabaseKey = 'sb_publishable_OFOpS0WMB4Sy0ciyIA9ySQ_59JH7Njh';
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

let chatHistory = [];

// Segédfüggvény: Biztonságos JSON tisztítás és parse-olás
function cleanAndParseChartJson(rawJson) {
  try {
    // Esetlegesen bent maradt markdown maradványok leszedése
    const clean = rawJson.replace(/```json-chart/g, "").replace(/```/g, "").trim();
    return JSON.parse(clean);
  } catch (e) {
    console.error("Hibás JSON formátum az AI-tól:", e);
    return null;
  }
}

// Feldolgozza az elkészült asszisztens szöveget, kiszűri a diagramot és gombot épít
function processMessageContent(messageDiv, rawText, userQuestion) {
  const chartRegex = /```json-chart([\s\S]*?)
```/;
  const match = rawText.match(chartRegex);

  if (match) {
    const jsonString = match[1].trim();
    
    // Eltávolítjuk a csúnya kódblokkot a szövegből, hogy tiszta maradjon a chat
    const textWithoutChart = rawText.replace(chartRegex, "").trim();
    messageDiv.innerHTML = textWithoutChart ? `<p>${textWithoutChart.replace(/\n/g, "<br>")}</p>` : "";

    // Létrehozzuk az interaktív gombot
    const buttonContainer = document.createElement("div");
    buttonContainer.style.margin = "15px 0";

    const btn = document.createElement("button");
    btn.innerHTML = "📊 Interaktív Grafikon Megnyitása";
    btn.style.cssText = "background:#6366f1; color:white; border:none; padding:10px 20px; border-radius:8px; cursor:pointer; font-weight:bold; display:flex; align-items:center; gap:8px; box-shadow: 0 2px 8px rgba(99,102,241,0.3); transition: all 0.2s;";
    
    btn.onmouseover = () => btn.style.background = "#4f46e5";
    btn.onmouseout = () => btn.style.background = "#6366f1";

    btn.onclick = async () => {
      btn.disabled = true;
      btn.textContent = "⌛ Diagram mentése...";

      const chartConfig = cleanAndParseChartJson(jsonString);

      if (!chartConfig) {
        alert("Sajnálom, a diagram adatszerkezete hibás volt.");
        btn.disabled = false;
        btn.innerHTML = "📊 Interaktív Grafikon Megnyitása";
        return;
      }

      try {
        // Mentés a Supabase 'charts' táblába
        const { data, error } = await supabase
          .from("charts")
          .insert([
            {
              config: chartConfig,
              question: userQuestion,
              explanation: "Az AMISEARCH AI által generált statisztikai vizualizáció."
            }
          ])
          .select("id")
          .single();

        if (error) throw error;

        if (data && data.id) {
          // Átirányítás a te diagram megjelenítő HTML oldaladra
          window.location.href = `/diagram.html?id=${data.id}`;
        }
      } catch (err) {
        console.error("Supabase mentési hiba:", err);
        alert("Nem sikerült elmenteni a diagramot a Supabase-be.");
        btn.disabled = false;
        btn.innerHTML = "📊 Interaktív Grafikon Megnyitása";
      }
    };

    buttonContainer.appendChild(btn);
    messageDiv.appendChild(buttonContainer);
  } else {
    // Sima szöveges válasz (vagy kép/mermaid amit a kliensoldali marked.js kezel)
    messageDiv.innerHTML = `<p>${rawText.replace(/\n/g, "<br>")}</p>`;
  }
}

// Üzenet küldése és Stream kezelése
async function sendMessage() {
  const text = userInput.value.trim();
  if (!text) return;

  // Felhasználói buborék hozzáadása
  const userDiv = document.createElement("div");
  userDiv.className = "message user";
  userDiv.textContent = text;
  chatContainer.appendChild(userDiv);
  
  userInput.value = "";
  chatContainer.scrollTop = chatContainer.scrollHeight;

  // AI válasz buborék előkészítése
  const aiDiv = document.createElement("div");
  aiDiv.className = "message assistant";
  aiDiv.textContent = "Gondolkodom...";
  chatContainer.appendChild(aiDiv);

  chatHistory.push({ role: "user", content: text });

  try {
    const response = await fetch("/.netlify/functions/chat-engine", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, history: chatHistory })
    });

    if (!response.ok) throw new Error("Hiba a szerver kommunikációban.");

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let accumulatedText = "";
    aiDiv.textContent = ""; // Alaphelyzetbe állítás a betöltés után

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      accumulatedText += decoder.decode(value, { stream: true });
      
      // Streaming közben nyers szövegként mutatjuk, hogy lássa a diák a haladást
      aiDiv.textContent = accumulatedText;
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    // Amikor a stream VÉGET ÉRT, feldolgozzuk és átalakítjuk a JSON blokkokat gommá
    processMessageContent(aiDiv, accumulatedText, text);
    chatHistory.push({ role: "assistant", content: accumulatedText });

  } catch (error) {
    console.error("Chat hiba:", error);
    aiDiv.textContent = "Sajnálom, hiba történt az üzenet feldolgozása közben.";
    aiDiv.style.color = "#dc2626";
  }
}

// Event Listeners
sendButton.addEventListener("click", sendMessage);
userInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});
