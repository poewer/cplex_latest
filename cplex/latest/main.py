import asyncio
import json
import re
from datetime import date
import websockets
from db import (
    add_user_if_not_exists,
    update_client_state,
    get_client_state,
    get_client,
)

connections = {}  # uuid -> websocket
admin_clients = set()  # websockety adminów
morning_tasks = {}


async def send_command(target_uuid: str, command: str):
    ws = connections.get(target_uuid)
    if ws and not ws.closed:
        await ws.send(json.dumps({"command": command}))
        print(f"➡️ Sent {command} to {target_uuid}")
    else:
        print(f"⚠️ {target_uuid} not connected")


def process_client_data(uuid: str, msg_type: str, value: str):
    updates = {}
    if msg_type == "QUANTIFIABLE_AMOUNT" or msg_type.lower() == "quantifiable_amount":
        match = re.search(r"[\d.]+", value or "")
        if match:
            updates["amount"] = float(match.group())
    elif msg_type == "BUTTON_STATUS" or msg_type.lower() == "button_status":
        updates["button_status"] = value.lower() if isinstance(value, str) else value
    if updates:
        update_client_state(uuid, updates)


async def run_start_morning(uuid: str):
    state = get_client(uuid)
    today = date.today().isoformat()
    if state.get("last_start_morning_date") == today:
        print(f"⏭️ {uuid} already processed today")
        update_client_state(uuid, {"start_morning_status": "skipped"})
        return

    update_client_state(
        uuid,
        {
            "running": True,
            "start_morning_clicks": 0,
            "last_start_morning_date": today,
            "start_morning_status": "running",
        },
    )

    await send_command(uuid, "refresh")
    await asyncio.sleep(10)
    await send_command(uuid, "amount")
    await asyncio.sleep(5)

    state = get_client_state(uuid)
    amount = state.get("amount")
    update_client_state(uuid, {"balance_before": str(amount) if amount is not None else None})

    clicks = 0
    while clicks < 4 and amount not in (None, 0, 0.0) and not str(amount).startswith("0"):
        await send_command(uuid, "check")
        await asyncio.sleep(5)
        state = get_client_state(uuid)
        if state.get("button_status") == "visible":
            await send_command(uuid, "click")
            clicks += 1
            update_client_state(uuid, {"start_morning_clicks": clicks})
        await asyncio.sleep(10)
        await send_command(uuid, "amount")
        await asyncio.sleep(5)
        state = get_client_state(uuid)
        amount = state.get("amount")

    update_client_state(
        uuid,
        {
            "running": False,
            "start_morning_status": "success",
            "balance_after": str(amount) if amount is not None else None,
        },
    )


async def handler(websocket):
    uuid = None
    try:
        init_message = await websocket.recv()
        data = json.loads(init_message)

        uuid = data.get("uuid")
        alias = data.get("alias", None)
        is_admin = data.get("is_admin", False)

        if not uuid:
            await websocket.send(json.dumps({"error": "Brakuje pola 'uuid'"}))
            return

        if is_admin:
            admin_clients.add(websocket)
            print(f"🛡️ Połączenie admina")
        else:
            add_user_if_not_exists(uuid=uuid, alias=alias)
            connections[uuid] = websocket
            print(f"🟢 Nowe połączenie od {uuid}")
            await websocket.send(json.dumps({"status": "connected", "uuid": uuid}))

        # 🔄 Obsługa dalszych wiadomości
        async for message in websocket:
            print(f"📨 Wiadomość od {uuid or 'admin'}: {message}")

            if message.strip().lower() == "ping":
                await websocket.send("pong")
                continue

            # Obsługa wiadomości admina
            if websocket in admin_clients:
                try:
                    cmd = json.loads(message)
                    target_uuid = cmd.get("uuid")
                    command = cmd.get("command")

                    if not target_uuid or not command:
                        await websocket.send(json.dumps({"error": "Brakuje uuid lub command"}))
                        continue

                    if command == "start_morning":
                        task = asyncio.create_task(run_start_morning(target_uuid))
                        morning_tasks[target_uuid] = task
                        await websocket.send(json.dumps({"status": f"Uruchomiono start_morning dla {target_uuid}"}))
                        continue

                    await send_command(target_uuid, command)
                    await websocket.send(json.dumps({"status": f"Komenda '{command}' wysłana do {target_uuid}"}))

                except Exception as e:
                    await websocket.send(json.dumps({"error": f"Błąd przetwarzania komendy: {str(e)}"}))
                continue

            # Obsługa wiadomości od klienta
            if uuid and websocket in connections.values():
                try:
                    data = json.loads(message)
                    msg_type = data.get("type")
                    value = data.get("value")
                    if msg_type:
                        process_client_data(uuid, msg_type, value)
                except Exception as e:
                    print(f"⚠️ Niepoprawna wiadomość od {uuid}: {e}")

    except websockets.exceptions.ConnectionClosed:
        print(f"🔴 Rozłączono: {uuid or 'admin'}")
    except Exception as e:
        print(f"❌ Błąd dla {uuid or 'admin'}: {e}")
    finally:
        if uuid and uuid in connections:
            del connections[uuid]
        if websocket in admin_clients:
            admin_clients.remove(websocket)


async def main():
    async with websockets.serve(handler, "localhost", 8080, ping_interval=None):
        print("🔵 Serwer WebSocket uruchomiony na porcie 8080")
        await asyncio.Future()

if __name__ == "__main__":
    asyncio.run(main())
