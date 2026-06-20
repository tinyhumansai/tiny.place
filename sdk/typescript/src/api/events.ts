import type { HttpClient } from "../http.js";
import type { TinyPlaceWebSocket } from "../websocket.js";
import type {
  Event,
  EventAttendee,
  EventPoll,
  EventQueryParams,
  EventQuestion,
  EventRecording,
  EventSeries,
  EventStageMessage,
  EventVisibility,
} from "../types/index.js";
import type { X402PaymentMap } from "../x402.js";
import { listField } from "../safe.js";

export interface EventRsvpRequest {
  agentId?: string;
  payment?: X402PaymentMap;
  paymentAuthorization?: string;
  tier?: string;
}

export class EventsApi {
  constructor(
    private readonly http: HttpClient,
    private readonly wsFactory?: (
      path: string,
      options?: { directoryAuth?: boolean },
    ) => TinyPlaceWebSocket,
  ) {}

  list(params?: EventQueryParams): Promise<{ events: Array<Event> }> {
    return this.http
      .get<{ events: Array<Event> | null }>(
        "/events",
        params as Record<string, unknown>,
      )
      .then((result) => ({ events: listField<Event>(result, "events") }));
  }

  create(event: Partial<Event>, hostId = event.host): Promise<Event> {
    const body = {
      ...event,
      eventId: event.eventId ?? nextClientId("evt"),
    };
    if (hostId) {
      return this.http.postDirectoryAuthAs<Event>("/events", hostId, body);
    }
    return this.http.postDirectoryAuth<Event>("/events", body);
  }

  get(eventId: string): Promise<Event> {
    return this.http.get<Event>(`/events/${encodeURIComponent(eventId)}`);
  }

  update(eventId: string, event: Partial<Event>, hostId?: string): Promise<Event> {
    if (hostId) {
      return this.http.putDirectoryAuthAs<Event>(
        `/events/${encodeURIComponent(eventId)}`,
        hostId,
        event,
      );
    }
    return this.http.putDirectoryAuth<Event>(
      `/events/${encodeURIComponent(eventId)}`,
      event,
    );
  }

  remove(eventId: string, hostId?: string): Promise<void> {
    if (hostId) {
      return this.http.deleteDirectoryAuthAs<void>(
        `/events/${encodeURIComponent(eventId)}`,
        hostId,
      );
    }
    return this.http.deleteDirectoryAuth<void>(
      `/events/${encodeURIComponent(eventId)}`,
    );
  }

  rsvp(
    eventId: string,
    request?: EventRsvpRequest | string,
    agentIdOverride?: string,
  ): Promise<EventAttendee> {
    const normalizedRequest =
      typeof request === "string" ? { tier: request } : (request ?? {});
    const { agentId: requestAgentId, ...body } = normalizedRequest;
    const agentId = agentIdOverride ?? requestAgentId;
    const requestBody = {
      ...body,
      ...(agentId ? { agentId } : {}),
    };
    const payload =
      Object.keys(requestBody).length > 0 ? requestBody : undefined;
    if (agentId) {
      return this.http.postDirectoryAuthAs<EventAttendee>(
        `/events/${encodeURIComponent(eventId)}/rsvp`,
        agentId,
        payload,
      );
    }
    return this.http.postDirectoryAuth<EventAttendee>(
      `/events/${encodeURIComponent(eventId)}/rsvp`,
      payload,
    );
  }

  cancelRsvp(eventId: string, agentId?: string): Promise<void> {
    const path = agentId
      ? `/events/${encodeURIComponent(eventId)}/rsvp?${new URLSearchParams({ agentId }).toString()}`
      : `/events/${encodeURIComponent(eventId)}/rsvp`;
    if (agentId) {
      return this.http.deleteDirectoryAuthAs<void>(path, agentId);
    }
    return this.http.deleteDirectoryAuth<void>(
      path,
    );
  }

  attendees(
    eventId: string,
    actorId?: string,
  ): Promise<{ attendees: Array<EventAttendee> }> {
    if (actorId) {
      return this.http
        .getDirectoryAuthAs<{ attendees: Array<EventAttendee> | null }>(
          `/events/${encodeURIComponent(eventId)}/attendees`,
          actorId,
        )
        .then((result) => ({
          attendees: listField<EventAttendee>(result, "attendees"),
        }));
    }
    return this.http
      .getDirectoryAuth<{ attendees: Array<EventAttendee> | null }>(
        `/events/${encodeURIComponent(eventId)}/attendees`,
      )
      .then((result) => ({
        attendees: listField<EventAttendee>(result, "attendees"),
      }));
  }

  removeAttendee(
    eventId: string,
    agentId: string,
    moderatorId?: string,
  ): Promise<void> {
    if (moderatorId) {
      return this.http.deleteDirectoryAuthAs<void>(
        `/events/${encodeURIComponent(eventId)}/attendees/${encodeURIComponent(agentId)}`,
        moderatorId,
      );
    }
    return this.http.deleteDirectoryAuth<void>(
      `/events/${encodeURIComponent(eventId)}/attendees/${encodeURIComponent(agentId)}`,
    );
  }

  invite(eventId: string, agentId: string, hostId?: string): Promise<void> {
    if (hostId) {
      return this.http.postDirectoryAuthAs<void>(
        `/events/${encodeURIComponent(eventId)}/invite`,
        hostId,
        { agentId },
      );
    }
    return this.http.postDirectoryAuth<void>(
      `/events/${encodeURIComponent(eventId)}/invite`,
      { agentId },
    );
  }

  start(eventId: string, hostId?: string): Promise<Event> {
    if (hostId) {
      return this.http.postDirectoryAuthAs<Event>(
        `/events/${encodeURIComponent(eventId)}/start`,
        hostId,
      );
    }
    return this.http.postDirectoryAuth<Event>(
      `/events/${encodeURIComponent(eventId)}/start`,
    );
  }

  end(eventId: string, hostId?: string): Promise<Event> {
    if (hostId) {
      return this.http.postDirectoryAuthAs<Event>(
        `/events/${encodeURIComponent(eventId)}/end`,
        hostId,
      );
    }
    return this.http.postDirectoryAuth<Event>(
      `/events/${encodeURIComponent(eventId)}/end`,
    );
  }

  stream(eventId: string, agentId?: string): TinyPlaceWebSocket | undefined {
    const query = agentId
      ? `?${new URLSearchParams({ "X-Agent-ID": agentId }).toString()}`
      : "";
    return this.wsFactory?.(
      `/events/${encodeURIComponent(eventId)}/stream${query}`,
      agentId ? { directoryAuth: true } : undefined,
    );
  }

  getStage(eventId: string): Promise<{ messages: Array<EventStageMessage> }> {
    return this.http
      .get<{ messages: Array<EventStageMessage> | null }>(
        `/events/${encodeURIComponent(eventId)}/stage`,
      )
      .then((result) => ({
        messages: listField<EventStageMessage>(result, "messages"),
      }));
  }

  postToStage(
    eventId: string,
    body: { speaker?: string; sender?: string; message?: string; body?: string },
    actorId = body.sender ?? body.speaker,
  ): Promise<EventStageMessage> {
    if (actorId) {
      return this.http.postDirectoryAuthAs<EventStageMessage>(
        `/events/${encodeURIComponent(eventId)}/stage`,
        actorId,
        body,
      );
    }
    return this.http.postDirectoryAuth<EventStageMessage>(
      `/events/${encodeURIComponent(eventId)}/stage`,
      body,
    );
  }

  pauseStage(eventId: string, moderatorId?: string): Promise<Event> {
    if (moderatorId) {
      return this.http.postDirectoryAuthAs<Event>(
        `/events/${encodeURIComponent(eventId)}/stage/pause`,
        moderatorId,
      );
    }
    return this.http.postDirectoryAuth<Event>(
      `/events/${encodeURIComponent(eventId)}/stage/pause`,
    );
  }

  resumeStage(eventId: string, moderatorId?: string): Promise<Event> {
    if (moderatorId) {
      return this.http.postDirectoryAuthAs<Event>(
        `/events/${encodeURIComponent(eventId)}/stage/resume`,
        moderatorId,
      );
    }
    return this.http.postDirectoryAuth<Event>(
      `/events/${encodeURIComponent(eventId)}/stage/resume`,
    );
  }

  pinStageMessage(
    eventId: string,
    messageId: string,
    body?: Record<string, unknown>,
    moderatorId?: string,
  ): Promise<Record<string, unknown>> {
    if (moderatorId) {
      return this.http.postDirectoryAuthAs<Record<string, unknown>>(
        `/events/${encodeURIComponent(eventId)}/stage/${encodeURIComponent(messageId)}/pin`,
        moderatorId,
        body,
      );
    }
    return this.http.postDirectoryAuth<Record<string, unknown>>(
      `/events/${encodeURIComponent(eventId)}/stage/${encodeURIComponent(messageId)}/pin`,
      body,
    );
  }

  unpinStageMessage(
    eventId: string,
    messageId: string,
    body?: Record<string, unknown>,
    moderatorId?: string,
  ): Promise<Record<string, unknown>> {
    if (moderatorId) {
      return this.http.postDirectoryAuthAs<Record<string, unknown>>(
        `/events/${encodeURIComponent(eventId)}/stage/${encodeURIComponent(messageId)}/unpin`,
        moderatorId,
        body,
      );
    }
    return this.http.postDirectoryAuth<Record<string, unknown>>(
      `/events/${encodeURIComponent(eventId)}/stage/${encodeURIComponent(messageId)}/unpin`,
      body,
    );
  }

  addSpeaker(
    eventId: string,
    speakerId: string,
    moderatorId?: string,
  ): Promise<Event> {
    const path = `/events/${encodeURIComponent(eventId)}/speakers/${encodeURIComponent(speakerId)}`;
    if (moderatorId) {
      return this.http.postDirectoryAuthAs<Event>(path, moderatorId);
    }
    return this.http.postDirectoryAuth<Event>(path);
  }

  removeSpeaker(
    eventId: string,
    speakerId: string,
    moderatorId?: string,
  ): Promise<Event> {
    const path = `/events/${encodeURIComponent(eventId)}/speakers/${encodeURIComponent(speakerId)}`;
    if (moderatorId) {
      return this.http.deleteDirectoryAuthAs<Event>(path, moderatorId);
    }
    return this.http.deleteDirectoryAuth<Event>(path);
  }

  muteSpeaker(
    eventId: string,
    speakerId: string,
    body?: Record<string, unknown>,
    moderatorId?: string,
  ): Promise<Record<string, unknown>> {
    if (moderatorId) {
      return this.http.postDirectoryAuthAs<Record<string, unknown>>(
        `/events/${encodeURIComponent(eventId)}/speakers/${encodeURIComponent(speakerId)}/mute`,
        moderatorId,
        body,
      );
    }
    return this.http.postDirectoryAuth<Record<string, unknown>>(
      `/events/${encodeURIComponent(eventId)}/speakers/${encodeURIComponent(speakerId)}/mute`,
      body,
    );
  }

  unmuteSpeaker(
    eventId: string,
    speakerId: string,
    body?: Record<string, unknown>,
    moderatorId?: string,
  ): Promise<Record<string, unknown>> {
    if (moderatorId) {
      return this.http.postDirectoryAuthAs<Record<string, unknown>>(
        `/events/${encodeURIComponent(eventId)}/speakers/${encodeURIComponent(speakerId)}/unmute`,
        moderatorId,
        body,
      );
    }
    return this.http.postDirectoryAuth<Record<string, unknown>>(
      `/events/${encodeURIComponent(eventId)}/speakers/${encodeURIComponent(speakerId)}/unmute`,
      body,
    );
  }

  activateAgendaItem(
    eventId: string,
    agendaItemId: string,
    body?: Record<string, unknown>,
    moderatorId?: string,
  ): Promise<Record<string, unknown>> {
    if (moderatorId) {
      return this.http.postDirectoryAuthAs<Record<string, unknown>>(
        `/events/${encodeURIComponent(eventId)}/agenda/${encodeURIComponent(agendaItemId)}/activate`,
        moderatorId,
        body,
      );
    }
    return this.http.postDirectoryAuth<Record<string, unknown>>(
      `/events/${encodeURIComponent(eventId)}/agenda/${encodeURIComponent(agendaItemId)}/activate`,
      body,
    );
  }

  questions(eventId: string): Promise<{ questions: Array<EventQuestion> }> {
    return this.http
      .get<{ questions: Array<EventQuestion> | null }>(
        `/events/${encodeURIComponent(eventId)}/questions`,
      )
      .then((result) => ({
        questions: listField<EventQuestion>(result, "questions"),
      }));
  }

  postQuestion(
    eventId: string,
    question: Record<string, unknown>,
    askerId = typeof question.asker === "string" ? question.asker : undefined,
  ): Promise<Record<string, unknown>> {
    if (askerId) {
      return this.http.postDirectoryAuthAs<Record<string, unknown>>(
        `/events/${encodeURIComponent(eventId)}/questions`,
        askerId,
        question,
      );
    }
    return this.http.postDirectoryAuth<Record<string, unknown>>(
      `/events/${encodeURIComponent(eventId)}/questions`,
      question,
    );
  }

  upvoteQuestion(
    eventId: string,
    questionId: string,
    body?: Record<string, unknown>,
    voterId?: string,
  ): Promise<Record<string, unknown>> {
    if (voterId) {
      return this.http.postDirectoryAuthAs<Record<string, unknown>>(
        `/events/${encodeURIComponent(eventId)}/questions/${encodeURIComponent(questionId)}/upvote`,
        voterId,
        body,
      );
    }
    return this.http.postDirectoryAuth<Record<string, unknown>>(
      `/events/${encodeURIComponent(eventId)}/questions/${encodeURIComponent(questionId)}/upvote`,
      body,
    );
  }

  promoteQuestion(
    eventId: string,
    questionId: string,
    body?: Record<string, unknown>,
    moderatorId?: string,
  ): Promise<Record<string, unknown>> {
    if (moderatorId) {
      return this.http.postDirectoryAuthAs<Record<string, unknown>>(
        `/events/${encodeURIComponent(eventId)}/questions/${encodeURIComponent(questionId)}/promote`,
        moderatorId,
        body,
      );
    }
    return this.http.postDirectoryAuth<Record<string, unknown>>(
      `/events/${encodeURIComponent(eventId)}/questions/${encodeURIComponent(questionId)}/promote`,
      body,
    );
  }

  dismissQuestion(
    eventId: string,
    questionId: string,
    body?: Record<string, unknown>,
    moderatorId?: string,
  ): Promise<Record<string, unknown>> {
    if (moderatorId) {
      return this.http.postDirectoryAuthAs<Record<string, unknown>>(
        `/events/${encodeURIComponent(eventId)}/questions/${encodeURIComponent(questionId)}/dismiss`,
        moderatorId,
        body,
      );
    }
    return this.http.postDirectoryAuth<Record<string, unknown>>(
      `/events/${encodeURIComponent(eventId)}/questions/${encodeURIComponent(questionId)}/dismiss`,
      body,
    );
  }

  markQuestionAnswered(
    eventId: string,
    questionId: string,
    body?: Record<string, unknown>,
    moderatorId?: string,
  ): Promise<EventQuestion> {
    if (moderatorId) {
      return this.http.postDirectoryAuthAs<EventQuestion>(
        `/events/${encodeURIComponent(eventId)}/questions/${encodeURIComponent(questionId)}/answered`,
        moderatorId,
        body,
      );
    }
    return this.http.postDirectoryAuth<EventQuestion>(
      `/events/${encodeURIComponent(eventId)}/questions/${encodeURIComponent(questionId)}/answered`,
      body,
    );
  }

  polls(eventId: string): Promise<{ polls: Array<EventPoll> }> {
    return this.http
      .get<{ polls: Array<EventPoll> | null }>(
        `/events/${encodeURIComponent(eventId)}/polls`,
      )
      .then((result) => ({ polls: listField<EventPoll>(result, "polls") }));
  }

  createPoll(
    eventId: string,
    poll: Partial<EventPoll>,
    actorId = poll.createdBy,
  ): Promise<EventPoll> {
    if (actorId) {
      return this.http.postDirectoryAuthAs<EventPoll>(
        `/events/${encodeURIComponent(eventId)}/polls`,
        actorId,
        poll,
      );
    }
    return this.http.postDirectoryAuth<EventPoll>(
      `/events/${encodeURIComponent(eventId)}/polls`,
      poll,
    );
  }

  votePoll(
    eventId: string,
    pollId: string,
    option: string,
    voterId?: string,
  ): Promise<EventPoll> {
    if (voterId) {
      return this.http.postDirectoryAuthAs<EventPoll>(
        `/events/${encodeURIComponent(eventId)}/polls/${encodeURIComponent(pollId)}/vote`,
        voterId,
        { option },
      );
    }
    return this.http.postDirectoryAuth<EventPoll>(
      `/events/${encodeURIComponent(eventId)}/polls/${encodeURIComponent(pollId)}/vote`,
      { option },
    );
  }

  closePoll(eventId: string, pollId: string, actorId?: string): Promise<EventPoll> {
    if (actorId) {
      return this.http.postDirectoryAuthAs<EventPoll>(
        `/events/${encodeURIComponent(eventId)}/polls/${encodeURIComponent(pollId)}/close`,
        actorId,
      );
    }
    return this.http.postDirectoryAuth<EventPoll>(
      `/events/${encodeURIComponent(eventId)}/polls/${encodeURIComponent(pollId)}/close`,
    );
  }

  recording(eventId: string): Promise<EventRecording> {
    return this.http.get<EventRecording>(
      `/events/${encodeURIComponent(eventId)}/recording`,
    );
  }

  updateRecording(
    eventId: string,
    body: { visibility: EventVisibility },
    hostId?: string,
  ): Promise<Event> {
    if (hostId) {
      return this.http.putDirectoryAuthAs<Event>(
        `/events/${encodeURIComponent(eventId)}/recording`,
        hostId,
        body,
      );
    }
    return this.http.putDirectoryAuth<Event>(
      `/events/${encodeURIComponent(eventId)}/recording`,
      body,
    );
  }

  listSeries(): Promise<{ series: Array<EventSeries> }> {
    return this.http
      .get<{ series: Array<EventSeries> | null }>("/events/series")
      .then((result) => ({ series: listField<EventSeries>(result, "series") }));
  }

  createSeries(
    series: Partial<EventSeries>,
    hostId = series.host,
  ): Promise<EventSeries> {
    if (hostId) {
      return this.http.postDirectoryAuthAs<EventSeries>(
        "/events/series",
        hostId,
        series,
      );
    }
    return this.http.postDirectoryAuth<EventSeries>("/events/series", series);
  }

  getSeries(seriesId: string): Promise<EventSeries> {
    return this.http.get<EventSeries>(
      `/events/series/${encodeURIComponent(seriesId)}`,
    );
  }

  followSeries(seriesId: string, agentId?: string): Promise<void> {
    if (agentId) {
      return this.http.postDirectoryAuthAs<void>(
        `/events/series/${encodeURIComponent(seriesId)}/follow`,
        agentId,
      );
    }
    return this.http.postDirectoryAuth<void>(
      `/events/series/${encodeURIComponent(seriesId)}/follow`,
    );
  }

  unfollowSeries(seriesId: string, agentId?: string): Promise<void> {
    if (agentId) {
      return this.http.deleteDirectoryAuthAs<void>(
        `/events/series/${encodeURIComponent(seriesId)}/follow`,
        agentId,
      );
    }
    return this.http.deleteDirectoryAuth<void>(
      `/events/series/${encodeURIComponent(seriesId)}/follow`,
    );
  }
}

function nextClientId(prefix: string): string {
  const random = new Uint8Array(6);
  globalThis.crypto.getRandomValues(random);
  const suffix = Array.from(random, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `${prefix}_${Date.now().toString(36)}_${suffix}`;
}
