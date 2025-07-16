// ✅ content.js
(() => {
  if (window.__cplexLoaded) {
    console.log('ℹ️ content.js already loaded');
    return;
  }
  window.__cplexLoaded = true;
  console.log('🚀 content.js initialized');

  const MESSAGE_TYPES = {
    CLICK: "click",
    CHECK: "check",
    AMOUNT: "amount",
    REFRESH: "refresh",
    CLOSE_POPUP: "closepopup"
  };

  const RESPONSE_KEYS = {
    BUTTON_STATUS: "BUTTON_STATUS",
    QUANTIFIABLE_AMOUNT: "QUANTIFIABLE_AMOUNT",
    POPUP_CLOSED: "POPUP_CLOSED"
  };

  function closePopupIfExists() {
    const popup = document.querySelector('.popup-con');
    const closeButton = document.querySelector('.cross i.van-icon-cross');
    if (popup && closeButton) {
      console.log('🔍 Znaleziono popup, próbuję go zamknąć...');
      closeButton.click();
      console.log('✅ Kliknięto przycisk zamykania popupu');
      return true;
    }
    console.log('ℹ️ Popup nie znaleziony lub już zamknięty');
    return false;
  }

  function handlePopupOnLoad() {
    let attempts = 0;
    const maxAttempts = 20;
    const interval = 1000;
    const initialDelay = 5000;

    const checkAndClose = () => {
      attempts++;
      console.log(`🔍 Próba ${attempts}/${maxAttempts} zamknięcia popupu...`);
      if (closePopupIfExists()) {
        console.log('✅ Popup zamknięty pomyślnie!');
        return;
      }
      if (attempts < maxAttempts) {
        setTimeout(checkAndClose, interval);
      } else {
        console.log('⏰ Osiągnięto maksymalną liczbę prób zamykania popupu');
      }
    };

    setTimeout(checkAndClose, initialDelay);
  }

  function sendResponse(type, value) {
    console.log('📤 sending response', { type, value });
    chrome.runtime.sendMessage({
      type: "client_response",
      payload: { type, value }
    });
  }

  const handlers = {
    [MESSAGE_TYPES.CLICK]: () => {
      const btn = document.querySelector(".start-btn");
      if (btn && btn.offsetParent !== null) {
        btn.click();
        console.log('✅ Kliknięto przycisk .start-btn');
      } else {
        console.warn('❌ Przycisk .start-btn niedostępny');
      }
    },
    [MESSAGE_TYPES.CHECK]: () => {
      const btn = document.querySelector(".start-btn");
      const status = !btn ? "missing" : btn.offsetParent === null ? "hidden" : "visible";
      sendResponse(RESPONSE_KEYS.BUTTON_STATUS, status);
      console.log('🧪 Status przycisku:', status);
    },
    [MESSAGE_TYPES.AMOUNT]: () => {
      let attempts = 0;
      const maxAttempts = 10;
      const interval = 1000;
      const checkAmount = () => {
        attempts++;
        console.log(`🔁 Próba ${attempts}: sprawdzam amount...`);
        const nameElem = Array.from(document.querySelectorAll(".item .name"))
          .find(el => el.textContent.includes("Today's Quantifiable Amount"));
        const parent = nameElem?.closest(".item");
        const valueElem = parent?.querySelector(".val");
        const amountText = valueElem?.textContent.trim() || "UNKNOWN";
        console.log('   znaleziono amount:', amountText);
        if (amountText !== "UNKNOWN" && !amountText.startsWith("0 /")) {
          sendResponse(RESPONSE_KEYS.QUANTIFIABLE_AMOUNT, amountText);
        } else if (attempts < maxAttempts) {
          setTimeout(checkAmount, interval);
        } else {
          sendResponse(RESPONSE_KEYS.QUANTIFIABLE_AMOUNT, amountText);
        }
      };
      checkAmount();
    },
    [MESSAGE_TYPES.REFRESH]: () => {
      console.log('🔄 Odświeżanie strony...');
      location.reload();
    },
    [MESSAGE_TYPES.CLOSE_POPUP]: () => {
      const result = closePopupIfExists();
      sendResponse(RESPONSE_KEYS.POPUP_CLOSED, result ? "success" : "failed");
      if (result) {
        console.log('✅ Popup zamknięty przez komendę');
      } else {
        console.log('❌ Nie udało się zamknąć popupu');
      }
    }
  };

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "ws_message") {
      try {
        const data = JSON.parse(message.payload);
        if (data.command && handlers[data.command]) {
          console.log('📨 Otrzymano komendę:', data.command);
          handlers[data.command]();
        }
      } catch (e) {
        console.warn("Nieprawidłowa wiadomość z WebSocket:", message.payload);
      }
    } else if (message.type === "log") {
      console.log(message.payload);
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', handlePopupOnLoad);
  } else {
    handlePopupOnLoad();
  }
})();
