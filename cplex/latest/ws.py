import asyncio
import json
import threading
import os
import re
from dotenv import load_dotenv
from telethon import TelegramClient, events
import websockets
from db import add_user_if_not_exists, update_client_state, get_client_state, get_all_uuids
from fastapi import FastAPI
import uvicorn

# === Wczytywanie .env ===
load_dotenv()
PORT = int(os.getenv("WEBSOCKET_PORT", 8765))
API_ID = int(os.getenv("API_ID"))
API_HASH = os.getenv("API_HASH")
PHONE = os.getenv("PHONE")
FROM_USERS = os.getenv("FROM_USERS", "Cplexautomatebot")

app = FastAPI()

class WebSocketServer:
    def __init__(self, port, message_handler):
        self.port = port
        self.connected_clients = set()
        self.message_handler = message_handler

    async def handler(self, websocket):
        print("[WS] Klient połączony")
        self.connected_clients.add(websocket)

        try:
            first_message = await websocket.recv()
            try:
                data = json.loads(first_message)
                uuid = data.get("uuid")
                if uuid:
                    add_user_if_not_exists(uuid)
            except Exception as e:
                print(f"[WS] Błąd przy pierwszej wiadomości: {e}")

            await self.message_handler(first_message)

            async for message in websocket:
                await self.message_handler(message)
        except websockets.exceptions.ConnectionClosed:
            print("[WS] Klient rozłączony")
        finally:
            self.connected_clients.remove(websocket)

    async def start(self):
        print(f"[WS] WebSocket nasłuchuje na porcie {self.port}")
        async with websockets.serve(self.handler, "0.0.0.0", self.port):
            await asyncio.Future()

    async def send_to_all(self, msg):
        if self.connected_clients:
            await asyncio.gather(*(client.send(msg) for client in self.connected_clients))
        else:
            print("[WS] Brak klientów")


class UserBotHandler:
    def __init__(self, api_id, api_hash, phone, from_users, send_ws_command):
        self.client = TelegramClient("sessions/user_session", api_id, api_hash)
        self.phone = phone
        self.from_users = from_users
        self.send_ws_command = send_ws_command

    async def run_morning_loop(self, uuid):
        update_client_state(uuid, {"running": True})
        attempt = 0

        while True:
            attempt += 1
            print(f"🔄 Iteracja #{attempt} dla {uuid}")
            update_client_state(uuid, {"amount": None, "button_status": None})

            await self.send_ws_command(json.dumps({"uuid": uuid, "type": "refresh"}))
            await asyncio.sleep(10)
            await self.send_ws_command(json.dumps({"uuid": uuid, "type": "amount"}))
            await asyncio.sleep(10)
            await self.send_ws_command(json.dumps({"uuid": uuid, "type": "check"}))
            await asyncio.sleep(10)

            state = get_client_state(uuid)
            amount = state.get("amount")
            button = state.get("button_status")

            if amount is None or button is None:
                print(f"⚠️ [{uuid}] Brak danych — ponawiam")
                continue

            if amount == 0.0:
                print(f"✅ [{uuid}] amount = 0 — kończę")
                update_client_state(uuid, {"running": False})
                break

            if button == "visible":
                print(f"🟢 [{uuid}] klikam")
                await self.send_ws_command(json.dumps({"uuid": uuid, "type": "click"}))
            else:
                print(f"⚠️ [{uuid}] przycisk: {button}")

            await asyncio.sleep(60)

    async def process_data(self, uuid, msg_type, value):
        updates = {}
        if msg_type == "quantifiable_amount":
            try:
                match = re.search(r"[\d.]+", value)
                if match:
                    updates["amount"] = float(match.group())
                    print(f"💰 [{uuid}] amount = {updates['amount']}")
            except Exception as e:
                print(f"❌ [{uuid}] Błąd parsowania amount: {e}")
        elif msg_type == "button_status":
            updates["button_status"] = value.lower()
            print(f"🔘 [{uuid}] button = {updates['button_status']}")

        if updates:
            update_client_state(uuid, updates)


class App:
    def __init__(self):
        self.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self.loop)
        self.ws_server = WebSocketServer(PORT, self._on_ws_message)
        self.userbot = UserBotHandler(API_ID, API_HASH, PHONE, FROM_USERS, self._send_ws_command)

    def start(self):
        print("[APP] Uruchamianie komponentów")
        threading.Thread(target=lambda: self.loop.run_until_complete(self.ws_server.start()), daemon=True).start()
        uvicorn.run(app, host="0.0.0.0", port=8000)

    async def _on_ws_message(self, raw_msg):
        try:
            data = json.loads(raw_msg)
        except json.JSONDecodeError:
            print("[ERROR] Błąd JSON:", raw_msg)
            return

        uuid = data.get("uuid")
        msg_type = data.get("type")
        value = data.get("value")

        if not uuid:
            print("⚠️ Brak UUID — ignoruję wiadomość")
            return

        print(f"[RECEIVED] {uuid} {msg_type}: {value}")
        await self.userbot.process_data(uuid, msg_type.lower(), value)

    async def _send_ws_command(self, msg):
        await self.ws_server.send_to_all(msg)

app_instance = App()

@app.post("/start-morning")
async def start_morning():
    uuid_list = get_all_uuids()
    for uuid in uuid_list:
        await app_instance.userbot.run_morning_loop(uuid)
    return {"status": "done", "processed": len(uuid_list)}

if __name__ == "__main__":
    app_instance.start()
