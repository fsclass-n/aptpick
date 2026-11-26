from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from ..core.security import decode_token
from ..services.realtime import hub

router = APIRouter(tags=["websocket"])


@router.websocket("/ws/notifications")
async def notifications(ws: WebSocket, token: str = ""):
    """가격 알림·공지·데이터 갱신 이벤트 실시간 전송 (token 쿼리 = JWT, 없으면 공개 이벤트만)"""
    payload = decode_token(token) if token else None
    user_id = int(payload["sub"]) if payload else None
    await hub.connect(ws, user_id)
    try:
        await ws.send_json({"type": "hello", "authenticated": bool(user_id)})
        while True:
            message = await ws.receive_text()
            if message == "ping":
                await ws.send_json({"type": "pong"})
    except WebSocketDisconnect:
        pass
    finally:
        hub.disconnect(ws, user_id)
