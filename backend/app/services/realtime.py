"""WebSocket 알림 허브 — 동기 라우트(스레드풀)에서도 안전하게 전송하도록 이벤트 루프에 위임"""
import asyncio
import json

from fastapi import WebSocket


class Hub:
    def __init__(self) -> None:
        self.users: dict[int, set[WebSocket]] = {}
        self.anonymous: set[WebSocket] = set()
        self.loop: asyncio.AbstractEventLoop | None = None

    @property
    def connections(self) -> int:
        return len(self.anonymous) + sum(len(s) for s in self.users.values())

    async def connect(self, ws: WebSocket, user_id: int | None) -> None:
        await ws.accept()
        self.loop = asyncio.get_running_loop()
        (self.users.setdefault(user_id, set()) if user_id else self.anonymous).add(ws)

    def disconnect(self, ws: WebSocket, user_id: int | None) -> None:
        (self.users.get(user_id, set()) if user_id else self.anonymous).discard(ws)

    async def _send(self, targets: list[WebSocket], payload: dict) -> None:
        text = json.dumps(payload, ensure_ascii=False)
        for ws in targets:
            try:
                await ws.send_text(text)
            except Exception:  # 끊긴 연결은 다음 disconnect 에서 정리
                pass

    def _dispatch(self, targets: list[WebSocket], payload: dict) -> None:
        if not targets or not self.loop or self.loop.is_closed():
            return
        try:
            running = asyncio.get_running_loop()
        except RuntimeError:
            running = None
        if running is self.loop:
            self.loop.create_task(self._send(targets, payload))
        else:
            asyncio.run_coroutine_threadsafe(self._send(targets, payload), self.loop)

    def send_user(self, user_id: int, payload: dict) -> None:
        self._dispatch(list(self.users.get(user_id, set())), payload)

    def broadcast(self, payload: dict) -> None:
        self._dispatch(list(self.anonymous) + [ws for s in self.users.values() for ws in s], payload)


hub = Hub()
