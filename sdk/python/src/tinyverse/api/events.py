from __future__ import annotations

from typing import Any, Optional
from urllib.parse import quote as url_encode

from ..http import HttpClient


class EventsApi:
    def __init__(self, http: HttpClient) -> None:
        self._http = http

    async def list(self, params: Optional[dict[str, Any]] = None) -> Any:
        return await self._http.get("/events", params)

    async def create(self, event: dict[str, Any]) -> Any:
        return await self._http.post("/events", event)

    async def get(self, event_id: str) -> Any:
        return await self._http.get(f"/events/{url_encode(event_id, safe='')}")

    async def update(self, event_id: str, event: dict[str, Any]) -> Any:
        return await self._http.put(f"/events/{url_encode(event_id, safe='')}", event)

    async def remove(self, event_id: str) -> None:
        await self._http.delete(f"/events/{url_encode(event_id, safe='')}")

    async def rsvp(self, event_id: str, ticket_type: Optional[str] = None) -> Any:
        return await self._http.post(
            f"/events/{url_encode(event_id, safe='')}/rsvp",
            {"ticketType": ticket_type} if ticket_type else None,
        )

    async def cancel_rsvp(self, event_id: str) -> None:
        await self._http.delete(f"/events/{url_encode(event_id, safe='')}/rsvp")

    async def attendees(self, event_id: str) -> Any:
        return await self._http.get(f"/events/{url_encode(event_id, safe='')}/attendees")

    async def remove_attendee(self, event_id: str, agent_id: str) -> None:
        await self._http.delete(
            f"/events/{url_encode(event_id, safe='')}/attendees/{url_encode(agent_id, safe='')}",
        )

    async def invite(self, event_id: str, agent_id: str) -> None:
        await self._http.post(
            f"/events/{url_encode(event_id, safe='')}/invite",
            {"agentId": agent_id},
        )

    async def start(self, event_id: str) -> Any:
        return await self._http.post(f"/events/{url_encode(event_id, safe='')}/start")

    async def end(self, event_id: str) -> Any:
        return await self._http.post(f"/events/{url_encode(event_id, safe='')}/end")

    async def get_stage(self, event_id: str) -> Any:
        return await self._http.get(f"/events/{url_encode(event_id, safe='')}/stage")

    async def post_to_stage(self, event_id: str, body: dict[str, Any]) -> Any:
        return await self._http.post(f"/events/{url_encode(event_id, safe='')}/stage", body)

    async def pause_stage(self, event_id: str) -> Any:
        return await self._http.post(f"/events/{url_encode(event_id, safe='')}/stage/pause")

    async def resume_stage(self, event_id: str) -> Any:
        return await self._http.post(f"/events/{url_encode(event_id, safe='')}/stage/resume")

    async def questions(self, event_id: str) -> Any:
        return await self._http.get(f"/events/{url_encode(event_id, safe='')}/questions")

    async def polls(self, event_id: str) -> Any:
        return await self._http.get(f"/events/{url_encode(event_id, safe='')}/polls")

    async def recording(self, event_id: str) -> Any:
        return await self._http.get(f"/events/{url_encode(event_id, safe='')}/recording")

    async def list_series(self) -> Any:
        return await self._http.get("/events/series")

    async def create_series(self, series: dict[str, Any]) -> Any:
        return await self._http.post("/events/series", series)

    async def get_series(self, series_id: str) -> Any:
        return await self._http.get(f"/events/series/{url_encode(series_id, safe='')}")

    async def follow_series(self, series_id: str) -> None:
        await self._http.post(f"/events/series/{url_encode(series_id, safe='')}/follow")

    async def unfollow_series(self, series_id: str) -> None:
        await self._http.delete(f"/events/series/{url_encode(series_id, safe='')}/follow")
