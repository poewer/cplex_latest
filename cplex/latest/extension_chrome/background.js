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

function sendToTab(tabId, type, payload) {
  chrome.tabs.sendMessage(tabId, { type, payload }, () => {
    if (chrome.runtime.lastError) {
      injectScript(tabId);
      chrome.tabs.sendMessage(tabId, { type, payload });
    }
  });
}

function logToTabs(message) {
  console.log(message);
  chrome.tabs.query({ url: "https://h5.coinplex.ai/quantify*" }, (tabs) => {
    for (const tab of tabs) {
      sendToTab(tab.id, "log", message);
    }
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
    changeInfo.status === "complete" &&
    tab.url &&
    tab.url.startsWith("https://h5.coinplex.ai/quantify")
  ) {
    injectScript(tabId);
  }
});


function connectWebSocket() {
  ws = new WebSocket("ws://localhost:8080");

  ws.onopen = () => {
    logToTabs("🟢 Połączono z WebSocket!");

    chrome.storage.local.get("uuid", (result) => {
      let uuid = result.uuid;

      if (!uuid) {
        uuid = crypto.randomUUID();
        chrome.storage.local.set({ uuid });
        logToTabs(`🆕 Wygenerowano nowy UUID: ${uuid}`);
      } else {
        logToTabs(`📦 Znaleziono UUID: ${uuid}`);
      }

      const alias = `client-${uuid.slice(-6)}`;
      const initPayload = { uuid, alias };
      ws.send(JSON.stringify(initPayload));
      logToTabs(`📤 Wysłano init payload: ${JSON.stringify(initPayload)}`);

      // Wyślij pierwszy ping dopiero po init
      if (ws.readyState === WebSocket.OPEN) {
        ws.send("ping");
        lastPongTime = Date.now();
        logToTabs("💓 Ping wysłany (start)");
      }
    });

    // Heartbeat co 15s
    heartbeatInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send("ping");
        logToTabs("💓 Ping wysłany");
      }
    }, 15000);

    // Watchdog co 10s – czeka max 45s na pong
    connectionWatchdog = setInterval(() => {
      const now = Date.now();
      if (now - lastPongTime > 45000) {
        logToTabs("⛔ Brak pong > 30s. Resetuję połączenie...");
        ws.close(); // To uruchomi reconnect
      }
    }, 10000);
  };

  ws.onmessage = (event) => {
    const msg = event.data.trim();

    if (msg === "pong") {
      lastPongTime = Date.now();
      logToTabs("📶 Odebrano pong");
      return;
    }

    logToTabs(`📩 Otrzymano z serwera: ${msg}`);

  // Szukamy wszystkich kart z docelową domeną i wysyłamy do nich wiadomość
  chrome.tabs.query({ url: "https://h5.coinplex.ai/quantify*" }, (tabs) => {
    if (tabs.length === 0) {
      logToTabs("🌐 Nie znaleziono karty z h5.coinplex.ai/quantify");
      return;
    }
    for (const tab of tabs) {
      sendToTab(tab.id, "ws_message", msg);
    }
  });
  };

  ws.onclose = () => {
    logToTabs("🔌 Połączenie zamknięte. Ponawiam za 5s...");
    clearInterval(heartbeatInterval);
    clearInterval(connectionWatchdog);
    setTimeout(connectWebSocket, reconnectDelay);
  };

  ws.onerror = (e) => {
    logToTabs(`❌ Błąd WebSocket: ${e}`);
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
        logToTabs(`📤 Wysłano do serwera: ${JSON.stringify(payload)}`);
      }
    });
  }
});
