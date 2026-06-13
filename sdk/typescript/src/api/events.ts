import type { HttpClient } from "../http.js";
import type { TinyVerseWebSocket } from "../websocket.js";
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

export class EventsApi {
  constructor(
    private readonly http: HttpClient,
    private readonly wsFactory?: (
      path: string,
      options?: { directoryAuth?: boolean },
    ) => TinyVerseWebSocket,
  ) {}

  list(params?: EventQueryParams): Promise<{ events: Array<Event> }> {
    return this.http.get<{ events: Array<Event> }>(
      "/events",
      params as Record<string, unknown>,
    );
  }

  create(event: Partial<Event>): Promise<Event> {
    return this.http.postDirectoryAuth<Event>("/events", {
      ...event,
      eventId: event.eventId ?? nextClientId("evt"),
    });
  }

  get(eventId: string): Promise<Event> {
    return this.http.get<Event>(`/events/${encodeURIComponent(eventId)}`);
  }

  update(eventId: string, event: Partial<Event>): Promise<Event> {
    return this.http.putDirectoryAuth<Event>(
      `/events/${encodeURIComponent(eventId)}`,
      event,
    );
  }

  remove(eventId: string): Promise<void> {
    return this.http.deleteDirectoryAuth<void>(
      `/events/${encodeURIComponent(eventId)}`,
    );
  }

  rsvp(eventId: string, tier?: string): Promise<EventAttendee> {
    return this.http.postDirectoryAuth<EventAttendee>(
      `/events/${encodeURIComponent(eventId)}/rsvp`,
      tier ? { tier } : undefined,
    );
  }

  cancelRsvp(eventId: string): Promise<void> {
    return this.http.deleteDirectoryAuth<void>(
      `/events/${encodeURIComponent(eventId)}/rsvp`,
    );
  }

  attendees(eventId: string): Promise<{ attendees: Array<EventAttendee> }> {
    return this.http.getDirectoryAuth<{ attendees: Array<EventAttendee> }>(
      `/events/${encodeURIComponent(eventId)}/attendees`,
    );
  }

  removeAttendee(eventId: string, agentId: string): Promise<void> {
    return this.http.deleteDirectoryAuth<void>(
      `/events/${encodeURIComponent(eventId)}/attendees/${encodeURIComponent(agentId)}`,
    );
  }

  invite(eventId: string, agentId: string): Promise<void> {
    return this.http.postDirectoryAuth<void>(
      `/events/${encodeURIComponent(eventId)}/invite`,
      { agentId },
    );
  }

  start(eventId: string): Promise<Event> {
    return this.http.postDirectoryAuth<Event>(
      `/events/${encodeURIComponent(eventId)}/start`,
    );
  }

  end(eventId: string): Promise<Event> {
    return this.http.postDirectoryAuth<Event>(
      `/events/${encodeURIComponent(eventId)}/end`,
    );
  }

  stream(eventId: string, agentId?: string): TinyVerseWebSocket | undefined {
    const query = agentId
      ? `?${new URLSearchParams({ "X-Agent-ID": agentId }).toString()}`
      : "";
    return this.wsFactory?.(
      `/events/${encodeURIComponent(eventId)}/stream${query}`,
      agentId ? { directoryAuth: true } : undefined,
    );
  }

  getStage(eventId: string): Promise<{ messages: Array<EventStageMessage> }> {
    return this.http.get<{ messages: Array<EventStageMessage> }>(
      `/events/${encodeURIComponent(eventId)}/stage`,
    );
  }

  postToStage(
    eventId: string,
    body: { speaker?: string; message: string },
  ): Promise<EventStageMessage> {
    return this.http.postDirectoryAuth<EventStageMessage>(
      `/events/${encodeURIComponent(eventId)}/stage`,
      body,
    );
  }

  pauseStage(eventId: string): Promise<Event> {
    return this.http.postDirectoryAuth<Event>(
      `/events/${encodeURIComponent(eventId)}/stage/pause`,
    );
  }

  resumeStage(eventId: string): Promise<Event> {
    return this.http.postDirectoryAuth<Event>(
      `/events/${encodeURIComponent(eventId)}/stage/resume`,
    );
  }

  pinStageMessage(
    eventId: string,
    messageId: string,
    body?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return this.http.postDirectoryAuth<Record<string, unknown>>(
      `/events/${encodeURIComponent(eventId)}/stage/${encodeURIComponent(messageId)}/pin`,
      body,
    );
  }

  unpinStageMessage(
    eventId: string,
    messageId: string,
    body?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
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
  ): Promise<Record<string, unknown>> {
    return this.http.postDirectoryAuth<Record<string, unknown>>(
      `/events/${encodeURIComponent(eventId)}/speakers/${encodeURIComponent(speakerId)}/mute`,
      body,
    );
  }

  unmuteSpeaker(
    eventId: string,
    speakerId: string,
    body?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return this.http.postDirectoryAuth<Record<string, unknown>>(
      `/events/${encodeURIComponent(eventId)}/speakers/${encodeURIComponent(speakerId)}/unmute`,
      body,
    );
  }

  activateAgendaItem(
    eventId: string,
    agendaItemId: string,
    body?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return this.http.postDirectoryAuth<Record<string, unknown>>(
      `/events/${encodeURIComponent(eventId)}/agenda/${encodeURIComponent(agendaItemId)}/activate`,
      body,
    );
  }

  questions(eventId: string): Promise<{ questions: Array<EventQuestion> }> {
    return this.http.get<{ questions: Array<EventQuestion> }>(
      `/events/${encodeURIComponent(eventId)}/questions`,
    );
  }

  postQuestion(
    eventId: string,
    question: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return this.http.postDirectoryAuth<Record<string, unknown>>(
      `/events/${encodeURIComponent(eventId)}/questions`,
      question,
    );
  }

  upvoteQuestion(
    eventId: string,
    questionId: string,
    body?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return this.http.postDirectoryAuth<Record<string, unknown>>(
      `/events/${encodeURIComponent(eventId)}/questions/${encodeURIComponent(questionId)}/upvote`,
      body,
    );
  }

  promoteQuestion(
    eventId: string,
    questionId: string,
    body?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return this.http.postDirectoryAuth<Record<string, unknown>>(
      `/events/${encodeURIComponent(eventId)}/questions/${encodeURIComponent(questionId)}/promote`,
      body,
    );
  }

  dismissQuestion(
    eventId: string,
    questionId: string,
    body?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return this.http.postDirectoryAuth<Record<string, unknown>>(
      `/events/${encodeURIComponent(eventId)}/questions/${encodeURIComponent(questionId)}/dismiss`,
      body,
    );
  }

  markQuestionAnswered(
    eventId: string,
    questionId: string,
    body?: Record<string, unknown>,
  ): Promise<EventQuestion> {
    return this.http.postDirectoryAuth<EventQuestion>(
      `/events/${encodeURIComponent(eventId)}/questions/${encodeURIComponent(questionId)}/answered`,
      body,
    );
  }

  polls(eventId: string): Promise<{ polls: Array<EventPoll> }> {
    return this.http.get<{ polls: Array<EventPoll> }>(
      `/events/${encodeURIComponent(eventId)}/polls`,
    );
  }

  createPoll(
    eventId: string,
    poll: Partial<EventPoll>,
  ): Promise<EventPoll> {
    return this.http.postDirectoryAuth<EventPoll>(
      `/events/${encodeURIComponent(eventId)}/polls`,
      poll,
    );
  }

  votePoll(
    eventId: string,
    pollId: string,
    option: string,
  ): Promise<EventPoll> {
    return this.http.postDirectoryAuth<EventPoll>(
      `/events/${encodeURIComponent(eventId)}/polls/${encodeURIComponent(pollId)}/vote`,
      { option },
    );
  }

  closePoll(eventId: string, pollId: string): Promise<EventPoll> {
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
  ): Promise<Event> {
    return this.http.putDirectoryAuth<Event>(
      `/events/${encodeURIComponent(eventId)}/recording`,
      body,
    );
  }

  listSeries(): Promise<{ series: Array<EventSeries> }> {
    return this.http.get<{ series: Array<EventSeries> }>("/events/series");
  }

  createSeries(series: Partial<EventSeries>): Promise<EventSeries> {
    return this.http.postDirectoryAuth<EventSeries>("/events/series", series);
  }

  getSeries(seriesId: string): Promise<EventSeries> {
    return this.http.get<EventSeries>(
      `/events/series/${encodeURIComponent(seriesId)}`,
    );
  }

  followSeries(seriesId: string): Promise<void> {
    return this.http.postDirectoryAuth<void>(
      `/events/series/${encodeURIComponent(seriesId)}/follow`,
    );
  }

  unfollowSeries(seriesId: string): Promise<void> {
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
