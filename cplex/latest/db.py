from supabase import create_client, Client

SUPABASE_URL = "https://zvazdgqkzovnmwtjscrv.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp2YXpkZ3Frem92bm13dGpzY3J2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NTM5MTEyNywiZXhwIjoyMDYwOTY3MTI3fQ.lnlEsHWtucqjZpQXNEkrwaXXoIdNOUia5qtjEchsF_w"  # skrócone

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)


def add_user_if_not_exists(uuid: str, alias: str = None):
    try:
        response = supabase.table("clients").select("uuid").eq("uuid", uuid).execute()
        if response.data:
            print(f"✅ UUID już istnieje: {uuid}")
            return
        insert_data = {"uuid": uuid, "alias": alias or ""}
        supabase.table("clients").insert(insert_data).execute()
        print(f"🆕 Dodano użytkownika: {uuid}")
    except Exception as e:
        print(f"❌ Błąd dodawania użytkownika {uuid}: {e}")


def update_client_state(uuid: str, updates: dict):
    try:
        response = supabase.table("clients").update(updates).eq("uuid", uuid).execute()
        print(f"✅ Zaktualizowano stan dla {uuid}: {updates}")
    except Exception as e:
        print(f"❌ Błąd aktualizacji stanu dla {uuid}: {e}")


def get_client_state(uuid: str) -> dict:
    try:
        response = supabase.table("clients").select("running, amount, button_status").eq("uuid", uuid).limit(1).execute()
        if response.data:
            return response.data[0]
        else:
            print(f"⚠️ Nie znaleziono klienta: {uuid}")
            return {}
    except Exception as e:
        print(f"❌ Błąd pobierania stanu klienta {uuid}: {e}")
        return {}


def get_all_uuids() -> list:
    try:
        response = supabase.table("clients").select("uuid").eq("is_enabled", True).execute()
        return [row["uuid"] for row in response.data]
    except Exception as e:
        print(f"❌ Błąd pobierania UUIDów: {e}")
        return []


def get_client(uuid: str) -> dict:
    """Return full client row for the given uuid."""
    try:
        response = supabase.table("clients").select("*").eq("uuid", uuid).limit(1).execute()
        if response.data:
            return response.data[0]
        else:
            print(f"⚠️ Nie znaleziono klienta: {uuid}")
            return {}
    except Exception as e:
        print(f"❌ Błąd pobierania klienta {uuid}: {e}")
        return {}
