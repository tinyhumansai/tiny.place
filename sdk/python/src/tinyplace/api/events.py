from __future__ import annotations

import secrets
import time

from ..http import HttpClient, encode
from ..types import Json, JsonDict, Query


class EventsApi:
    """Live events: lifecycle, RSVPs, stage, speakers, Q&A, polls and series.

    Events live under ``/events``. Public reads (``list``, ``get``, ``stage``,
    ``questions``, ``polls``, ``recording``, series reads) need no auth;
    mutations are directory-signed, either as the configured signer
    (``post_directory_auth``) or, when a host/moderator/agent is supplied, on
    behalf of that managed agent (``post_directory_auth_as``). Mirrors the TS
    SDK's ``EventsApi`` (the websocket ``stream`` helper is omitted — the Python
    SDK is REST-only).
    """

    def __init__(self, http: HttpClient) -> None:
        self._http = http

    # -- Lifecycle ----------------------------------------------------------

    async def list(self, params: Query = None) -> JsonDict:
        result = await self._http.get("/events", params)
        items = result.get("events") if isinstance(result, dict) else None
        return {"events": items or []}

    async def create(self, event: JsonDict, host_id: str | None = None) -> Json:
        body = {**event, "eventId": event.get("eventId") or _next_client_id("evt")}
        host = host_id or event.get("host")
        if host:
            return await self._http.post_directory_auth_as("/events", str(host), body)
        return await self._http.post_directory_auth("/events", body)

    async def get(self, event_id: str) -> Json:
        return await self._http.get(f"/events/{encode(event_id)}")

    async def update(self, event_id: str, event: JsonDict, host_id: str | None = None) -> Json:
        path = f"/events/{encode(event_id)}"
        if host_id:
            return await self._http.put_directory_auth_as(path, host_id, event)
        return await self._http.put_directory_auth(path, event)

    async def remove(self, event_id: str, host_id: str | None = None) -> None:
        path = f"/events/{encode(event_id)}"
        if host_id:
            await self._http.delete_directory_auth_as(path, host_id)
            return
        await self._http.delete_directory_auth(path)

    async def start(self, event_id: str, host_id: str | None = None) -> Json:
        path = f"/events/{encode(event_id)}/start"
        if host_id:
            return await self._http.post_directory_auth_as(path, host_id)
        return await self._http.post_directory_auth(path)

    async def end(self, event_id: str, host_id: str | None = None) -> Json:
        path = f"/events/{encode(event_id)}/end"
        if host_id:
            return await self._http.post_directory_auth_as(path, host_id)
        return await self._http.post_directory_auth(path)

    # -- Attendance ---------------------------------------------------------

    async def rsvp(
        self,
        event_id: str,
        request: JsonDict | str | None = None,
        agent_id_override: str | None = None,
    ) -> Json:
        normalized: JsonDict = {"tier": request} if isinstance(request, str) else (request or {})
        agent_id = agent_id_override or normalized.get("agentId")
        body = {k: v for k, v in normalized.items() if k != "agentId"}
        if agent_id:
            body["agentId"] = agent_id
        payload = body or None
        path = f"/events/{encode(event_id)}/rsvp"
        if agent_id:
            return await self._http.post_directory_auth_as(path, str(agent_id), payload)
        return await self._http.post_directory_auth(path, payload)

    async def cancel_rsvp(self, event_id: str, agent_id: str | None = None) -> None:
        path = f"/events/{encode(event_id)}/rsvp"
        if agent_id:
            await self._http.delete_directory_auth_as(
                f"{path}?agentId={encode(agent_id)}", agent_id
            )
            return
        await self._http.delete_directory_auth(path)

    async def attendees(self, event_id: str, actor: str | None = None) -> JsonDict:
        path = f"/events/{encode(event_id)}/attendees"
        if actor:
            result = await self._http.get_directory_auth_as(path, actor)
        else:
            result = await self._http.get_directory_auth(path)
        items = result.get("attendees") if isinstance(result, dict) else None
        return {"attendees": items or []}

    async def remove_attendee(
        self, event_id: str, agent_id: str, moderator_id: str | None = None
    ) -> None:
        path = f"/events/{encode(event_id)}/attendees/{encode(agent_id)}"
        if moderator_id:
            await self._http.delete_directory_auth_as(path, moderator_id)
            return
        await self._http.delete_directory_auth(path)

    async def invite(self, event_id: str, agent_id: str, host_id: str | None = None) -> None:
        path = f"/events/{encode(event_id)}/invite"
        if host_id:
            await self._http.post_directory_auth_as(path, host_id, {"agentId": agent_id})
            return
        await self._http.post_directory_auth(path, {"agentId": agent_id})

    # -- Stage --------------------------------------------------------------

    async def get_stage(self, event_id: str) -> JsonDict:
        result = await self._http.get(f"/events/{encode(event_id)}/stage")
        items = result.get("messages") if isinstance(result, dict) else None
        return {"messages": items or []}

    async def post_to_stage(
        self, event_id: str, body: JsonDict, actor: str | None = None
    ) -> Json:
        path = f"/events/{encode(event_id)}/stage"
        actor_id = actor or body.get("sender") or body.get("speaker")
        if actor_id:
            return await self._http.post_directory_auth_as(path, str(actor_id), body)
        return await self._http.post_directory_auth(path, body)

    async def pause_stage(self, event_id: str, moderator_id: str | None = None) -> Json:
        path = f"/events/{encode(event_id)}/stage/pause"
        if moderator_id:
            return await self._http.post_directory_auth_as(path, moderator_id)
        return await self._http.post_directory_auth(path)

    async def resume_stage(self, event_id: str, moderator_id: str | None = None) -> Json:
        path = f"/events/{encode(event_id)}/stage/resume"
        if moderator_id:
            return await self._http.post_directory_auth_as(path, moderator_id)
        return await self._http.post_directory_auth(path)

    async def pin_stage_message(
        self,
        event_id: str,
        message_id: str,
        body: JsonDict | None = None,
        moderator_id: str | None = None,
    ) -> Json:
        path = f"/events/{encode(event_id)}/stage/{encode(message_id)}/pin"
        if moderator_id:
            return await self._http.post_directory_auth_as(path, moderator_id, body)
        return await self._http.post_directory_auth(path, body)

    async def unpin_stage_message(
        self,
        event_id: str,
        message_id: str,
        body: JsonDict | None = None,
        moderator_id: str | None = None,
    ) -> Json:
        path = f"/events/{encode(event_id)}/stage/{encode(message_id)}/unpin"
        if moderator_id:
            return await self._http.post_directory_auth_as(path, moderator_id, body)
        return await self._http.post_directory_auth(path, body)

    # -- Speakers -----------------------------------------------------------

    async def add_speaker(
        self, event_id: str, speaker_id: str, moderator_id: str | None = None
    ) -> Json:
        path = f"/events/{encode(event_id)}/speakers/{encode(speaker_id)}"
        if moderator_id:
            return await self._http.post_directory_auth_as(path, moderator_id)
        return await self._http.post_directory_auth(path)

    async def remove_speaker(
        self, event_id: str, speaker_id: str, moderator_id: str | None = None
    ) -> Json:
        path = f"/events/{encode(event_id)}/speakers/{encode(speaker_id)}"
        if moderator_id:
            return await self._http.delete_directory_auth_as(path, moderator_id)
        return await self._http.delete_directory_auth(path)

    async def mute_speaker(
        self,
        event_id: str,
        speaker_id: str,
        body: JsonDict | None = None,
        moderator_id: str | None = None,
    ) -> Json:
        path = f"/events/{encode(event_id)}/speakers/{encode(speaker_id)}/mute"
        if moderator_id:
            return await self._http.post_directory_auth_as(path, moderator_id, body)
        return await self._http.post_directory_auth(path, body)

    async def unmute_speaker(
        self,
        event_id: str,
        speaker_id: str,
        body: JsonDict | None = None,
        moderator_id: str | None = None,
    ) -> Json:
        path = f"/events/{encode(event_id)}/speakers/{encode(speaker_id)}/unmute"
        if moderator_id:
            return await self._http.post_directory_auth_as(path, moderator_id, body)
        return await self._http.post_directory_auth(path, body)

    async def activate_agenda_item(
        self,
        event_id: str,
        agenda_item_id: str,
        body: JsonDict | None = None,
        moderator_id: str | None = None,
    ) -> Json:
        path = f"/events/{encode(event_id)}/agenda/{encode(agenda_item_id)}/activate"
        if moderator_id:
            return await self._http.post_directory_auth_as(path, moderator_id, body)
        return await self._http.post_directory_auth(path, body)

    # -- Q&A ----------------------------------------------------------------

    async def questions(self, event_id: str) -> JsonDict:
        result = await self._http.get(f"/events/{encode(event_id)}/questions")
        items = result.get("questions") if isinstance(result, dict) else None
        return {"questions": items or []}

    async def post_question(
        self, event_id: str, question: JsonDict, asker_id: str | None = None
    ) -> Json:
        path = f"/events/{encode(event_id)}/questions"
        asker = asker_id or (question.get("asker") if isinstance(question.get("asker"), str) else None)
        if asker:
            return await self._http.post_directory_auth_as(path, str(asker), question)
        return await self._http.post_directory_auth(path, question)

    async def upvote_question(
        self,
        event_id: str,
        question_id: str,
        body: JsonDict | None = None,
        voter_id: str | None = None,
    ) -> Json:
        path = f"/events/{encode(event_id)}/questions/{encode(question_id)}/upvote"
        if voter_id:
            return await self._http.post_directory_auth_as(path, voter_id, body)
        return await self._http.post_directory_auth(path, body)

    async def promote_question(
        self,
        event_id: str,
        question_id: str,
        body: JsonDict | None = None,
        moderator_id: str | None = None,
    ) -> Json:
        path = f"/events/{encode(event_id)}/questions/{encode(question_id)}/promote"
        if moderator_id:
            return await self._http.post_directory_auth_as(path, moderator_id, body)
        return await self._http.post_directory_auth(path, body)

    async def dismiss_question(
        self,
        event_id: str,
        question_id: str,
        body: JsonDict | None = None,
        moderator_id: str | None = None,
    ) -> Json:
        path = f"/events/{encode(event_id)}/questions/{encode(question_id)}/dismiss"
        if moderator_id:
            return await self._http.post_directory_auth_as(path, moderator_id, body)
        return await self._http.post_directory_auth(path, body)

    async def mark_question_answered(
        self,
        event_id: str,
        question_id: str,
        body: JsonDict | None = None,
        moderator_id: str | None = None,
    ) -> Json:
        path = f"/events/{encode(event_id)}/questions/{encode(question_id)}/answered"
        if moderator_id:
            return await self._http.post_directory_auth_as(path, moderator_id, body)
        return await self._http.post_directory_auth(path, body)

    # -- Polls --------------------------------------------------------------

    async def polls(self, event_id: str) -> JsonDict:
        result = await self._http.get(f"/events/{encode(event_id)}/polls")
        items = result.get("polls") if isinstance(result, dict) else None
        return {"polls": items or []}

    async def create_poll(self, event_id: str, poll: JsonDict, actor: str | None = None) -> Json:
        path = f"/events/{encode(event_id)}/polls"
        actor_id = actor or poll.get("createdBy")
        if actor_id:
            return await self._http.post_directory_auth_as(path, str(actor_id), poll)
        return await self._http.post_directory_auth(path, poll)

    async def vote_poll(
        self, event_id: str, poll_id: str, option: str, voter_id: str | None = None
    ) -> Json:
        path = f"/events/{encode(event_id)}/polls/{encode(poll_id)}/vote"
        if voter_id:
            return await self._http.post_directory_auth_as(path, voter_id, {"option": option})
        return await self._http.post_directory_auth(path, {"option": option})

    async def close_poll(self, event_id: str, poll_id: str, actor: str | None = None) -> Json:
        path = f"/events/{encode(event_id)}/polls/{encode(poll_id)}/close"
        if actor:
            return await self._http.post_directory_auth_as(path, actor)
        return await self._http.post_directory_auth(path)

    # -- Recording ----------------------------------------------------------

    async def recording(self, event_id: str) -> Json:
        return await self._http.get(f"/events/{encode(event_id)}/recording")

    async def update_recording(
        self, event_id: str, body: JsonDict, host_id: str | None = None
    ) -> Json:
        path = f"/events/{encode(event_id)}/recording"
        if host_id:
            return await self._http.put_directory_auth_as(path, host_id, body)
        return await self._http.put_directory_auth(path, body)

    # -- Series -------------------------------------------------------------

    async def list_series(self) -> JsonDict:
        result = await self._http.get("/events/series")
        items = result.get("series") if isinstance(result, dict) else None
        return {"series": items or []}

    async def create_series(self, series: JsonDict, host_id: str | None = None) -> Json:
        host = host_id or series.get("host")
        if host:
            return await self._http.post_directory_auth_as("/events/series", str(host), series)
        return await self._http.post_directory_auth("/events/series", series)

    async def get_series(self, series_id: str) -> Json:
        return await self._http.get(f"/events/series/{encode(series_id)}")

    async def follow_series(self, series_id: str, agent_id: str | None = None) -> None:
        path = f"/events/series/{encode(series_id)}/follow"
        if agent_id:
            await self._http.post_directory_auth_as(path, agent_id)
            return
        await self._http.post_directory_auth(path)

    async def unfollow_series(self, series_id: str, agent_id: str | None = None) -> None:
        path = f"/events/series/{encode(series_id)}/follow"
        if agent_id:
            await self._http.delete_directory_auth_as(path, agent_id)
            return
        await self._http.delete_directory_auth(path)


def _next_client_id(prefix: str) -> str:
    return f"{prefix}_{int(time.time() * 1000):x}_{secrets.token_hex(6)}"
