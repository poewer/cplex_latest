import asyncio
import json
import websockets
from db import add_user_if_not_exists
from User import User

connections = {}  # uuid -> websocket
admin_clients = set()  # websockety adminów


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

                    target_ws = connections.get(target_uuid)
                    if target_ws:
                        await target_ws.send(json.dumps({"command": command}))
                        await websocket.send(json.dumps({"status": f"Komenda '{command}' wysłana do {target_uuid}"}))
                    else:
                        await websocket.send(json.dumps({"error": f"{target_uuid} nie jest połączony"}))

                except Exception as e:
                    await websocket.send(json.dumps({"error": f"Błąd przetwarzania komendy: {str(e)}"}))

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
