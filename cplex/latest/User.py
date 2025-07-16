class User:
    def __init__(self, uuid, alias=None, is_enabled=True, running=False, amount=None, button_status=None):
        self.uuid = uuid
        self.alias = alias
        self.is_enabled = is_enabled
        self.running = running
        self.amount = amount
        self.button_status = button_status

    def __repr__(self):
        return f"<User uuid={self.uuid} alias={self.alias} enabled={self.is_enabled} running={self.running}>"

    def to_dict(self):
        return {
            "uuid": self.uuid,
            "alias": self.alias,
            "is_enabled": self.is_enabled,
            "running": self.running,
            "amount": self.amount,
            "button_status": self.button_status
        }
