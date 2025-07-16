let ws;
let reconnectDelay = 5000;
let heartbeatInterval = null;
let connectionWatchdog = null;
let lastPongTime = Date.now();


chrome.scripting.executeScript({
  target: { tabId },
  func: () => {
    if (!window.__wsInjected) {
      window.__wsInjected = true;
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('content.js');
      document.documentElement.appendChild(script);
      console.log("✅ Załadowano content.js tylko raz");
    }
  }
});


function connectWebSocket() {
  ws = new WebSocket("ws://localhost:8080");

  ws.onopen = () => {
    console.log("🟢 Połączono z WebSocket!");

    chrome.storage.local.get("uuid", (result) => {
      let uuid = result.uuid;

      if (!uuid) {
        uuid = crypto.randomUUID();
        chrome.storage.local.set({ uuid });
        console.log("🆕 Wygenerowano nowy UUID:", uuid);
      } else {
        console.log("📦 Znaleziono UUID:", uuid);
      }

      const alias = `client-${uuid.slice(-6)}`;
      const initPayload = { uuid, alias };
      ws.send(JSON.stringify(initPayload));
      console.log("📤 Wysłano init payload:", initPayload);
    });

    // Heartbeat co 5 minut
    heartbeatInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send("ping");
        console.log("💓 Ping wysłany");
      }
    }, 5 * 60 * 1000);

    // Watchdog co 10s – czeka max 30s na pong
    connectionWatchdog = setInterval(() => {
      const now = Date.now();
      if (now - lastPongTime > 30000) {
        console.warn("⛔ Brak pong > 30s. Resetuję połączenie...");
        ws.close(); // To uruchomi reconnect
      }
    }, 10000);
  };

  ws.onmessage = (event) => {
    const msg = event.data.trim();

    if (msg === "pong") {
      lastPongTime = Date.now();
      console.log("📶 Odebrano pong");
      return;
    }

    console.log("📩 Otrzymano z serwera:", msg);

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0) {
        chrome.tabs.sendMessage(tabs[0].id, { type: "ws_message", payload: msg });
      }
    });
  };

  ws.onclose = () => {
    console.warn("🔌 Połączenie zamknięte. Ponawiam za 5s...");
    clearInterval(heartbeatInterval);
    clearInterval(connectionWatchdog);
    setTimeout(connectWebSocket, reconnectDelay);
  };

  ws.onerror = (e) => {
    console.error("❌ Błąd WebSocket:", e);
    if (ws.readyState !== WebSocket.CLOSED) {
      ws.close();
    }
  };
}

connectWebSocket();
