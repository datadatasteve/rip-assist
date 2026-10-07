"""Notification interface.

Trigger logic calls `notify(...)` only. Channels are pluggable: in-app (a row in
`notifications`, which syncs to every device via Realtime) and Web Push are
live in V1; Telegram is stubbed for V2.
"""
import asyncio
import json
import logging

import config
import db

log = logging.getLogger("push")

NOTIFICATION_TYPES = {"checkin_reminder", "momentum_alert", "waiting_followup", "plan_infeasible", "dead_item", "test"}


class Channel:
    name = "base"

    async def send(self, user_id: str, title: str, body: str, url: str | None, tag: str) -> int:
        raise NotImplementedError


class WebPushChannel(Channel):
    name = "webpush"

    @staticmethod
    def configured() -> bool:
        return bool(config.VAPID_PRIVATE_KEY and config.VAPID_PUBLIC_KEY and config.VAPID_EMAIL)

    async def send(self, user_id: str, title: str, body: str, url: str | None, tag: str) -> int:
        if not self.configured():
            return 0
        from pywebpush import WebPushException, webpush  # imported lazily: heavy

        subs = await db.select_user("push_subscriptions", user_id)
        payload = json.dumps({"title": title, "body": body, "url": url or "", "tag": tag})
        sent = 0
        for s in subs:
            try:
                await asyncio.to_thread(
                    webpush,
                    subscription_info=s["subscription"],
                    data=payload,
                    vapid_private_key=config.VAPID_PRIVATE_KEY,
                    vapid_claims={"sub": f"mailto:{config.VAPID_EMAIL}"},
                    ttl=3600,
                )
                sent += 1
            except WebPushException as e:
                status = getattr(e.response, "status_code", None)
                if status in (404, 410):  # subscription expired / revoked
                    await db.delete("push_subscriptions", user_id, {"id": s["id"]})
                else:
                    log.warning("webpush failed for %s: %s", s["id"], e)
            except Exception as e:  # noqa: BLE001
                log.warning("webpush error for %s: %s", s["id"], e)
        return sent


class TelegramChannel(Channel):
    """V2 stub. Wire bot token + chat id here; trigger logic needs no changes."""
    name = "telegram"

    async def send(self, user_id: str, title: str, body: str, url: str | None, tag: str) -> int:
        return 0


CHANNELS: list[Channel] = [WebPushChannel(), TelegramChannel()]


async def notify(user_id: str, type: str, title: str, body: str = "", url: str | None = None,
                 entity_id: str | None = None) -> dict:
    """Record an in-app notification and fan out to push channels."""
    used = ["in_app"]
    results = {}
    for ch in CHANNELS:
        try:
            n = await ch.send(user_id, title, body, url, tag=f"{type}:{entity_id or ''}")
        except NotImplementedError:
            n = 0
        results[ch.name] = n
        if n:
            used.append(ch.name)
    await db.insert("notifications", {
        "user_id": user_id, "type": type, "title": title, "body": body, "url": url,
        "entity_id": entity_id, "channels": used,
    })
    return results
