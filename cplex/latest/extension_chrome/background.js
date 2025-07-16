let ws;
let reconnectDelay = 5000;
let heartbeatInterval = null;
let connectionWatchdog = null;
let lastPongTime = Date.now();

function injectScript(tabId) {
  chrome.scripting.executeScript(
    { target: { tabId }, files: ["content.js"] },
    () => {
      if (chrome.runtime.lastError) {
        console.warn(
          `❌ Injection failed for ${tabId}: ${chrome.runtime.lastError.message}`
        );
      } else {
        console.log(`✅ Injected content.js into ${tabId}`);
      }
    }
  );
}

function sendToTab(tabId, msg) {
  chrome.tabs
    .sendMessage(tabId, { type: "ws_message", payload: msg })
    .catch(() => {
      injectScript(tabId);
      chrome.tabs.sendMessage(tabId, { type: "ws_message", payload: msg });
    });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.tabs.query({ url: "https://h5.coinplex.ai/quantify*" }, (tabs) => {
    for (const tab of tabs) {
      injectScript(tab.id);
    }
  });
});

chrome.runtime.onStartup.addListener(() => {
  chrome.tabs.query({ url: "https://h5.coinplex.ai/quantify*" }, (tabs) => {
    for (const tab of tabs) {
      injectScript(tab.id);
    }
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (
    changeInfo.status === 'complete' &&
    tab.url &&
    tab.url.startsWith('https://h5.coinplex.ai/quantify')
  ) {
    injectScript(tabId);
  }
});



// content.js jest wstrzykiwany automatycznie przez manifest


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

    // Wyślij pierwszy ping od razu po połączeniu
    if (ws.readyState === WebSocket.OPEN) {
      ws.send("ping");
      lastPongTime = Date.now();
      console.log("💓 Ping wysłany (start)");
    }

    // Heartbeat co 15s
    heartbeatInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send("ping");
        console.log("💓 Ping wysłany");
      }
    }, 15000);

    // Watchdog co 10s – czeka max 45s na pong
    connectionWatchdog = setInterval(() => {
      const now = Date.now();
      if (now - lastPongTime > 45000) {
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

  // Szukamy wszystkich kart z docelową domeną i wysyłamy do nich wiadomość
  chrome.tabs.query({ url: "https://h5.coinplex.ai/quantify*" }, (tabs) => {
    if (tabs.length === 0) {
      console.warn("🌐 Nie znaleziono karty z h5.coinplex.ai/quantify");
      return;
    }
    for (const tab of tabs) {
      sendToTab(tab.id, msg);
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

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "client_response") {
    chrome.storage.local.get("uuid", (result) => {
      const uuid = result.uuid;
      if (!uuid) return;
      const payload = { uuid, type: message.payload.type, value: message.payload.value };
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(payload));
        console.log("📤 Wysłano do serwera:", payload);
      }
    });
  }
});
