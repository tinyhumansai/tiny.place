import type { HttpClient } from "../http.js";
import type {
  Event,
  EventAttendee,
  EventPoll,
  EventQueryParams,
  EventQuestion,
  EventRecording,
  EventSeries,
  EventStageMessage,
} from "../types/index.js";

export class EventsApi {
  constructor(private readonly http: HttpClient) {}

  list(params?: EventQueryParams): Promise<{ events: Array<Event> }> {
    return this.http.get<{ events: Array<Event> }>("/events", params as Record<string, unknown>);
  }

  create(event: Partial<Event>): Promise<Event> {
    return this.http.post<Event>("/events", event);
  }

  get(eventId: string): Promise<Event> {
    return this.http.get<Event>(`/events/${encodeURIComponent(eventId)}`);
  }

  update(eventId: string, event: Partial<Event>): Promise<Event> {
    return this.http.put<Event>(`/events/${encodeURIComponent(eventId)}`, event);
  }

  remove(eventId: string): Promise<void> {
    return this.http.delete<void>(`/events/${encodeURIComponent(eventId)}`);
  }

  rsvp(eventId: string, ticketType?: string): Promise<EventAttendee> {
    return this.http.post<EventAttendee>(
      `/events/${encodeURIComponent(eventId)}/rsvp`,
      ticketType ? { ticketType } : undefined,
    );
  }

  cancelRsvp(eventId: string): Promise<void> {
    return this.http.delete<void>(`/events/${encodeURIComponent(eventId)}/rsvp`);
  }

  attendees(eventId: string): Promise<{ attendees: Array<EventAttendee> }> {
    return this.http.get<{ attendees: Array<EventAttendee> }>(
      `/events/${encodeURIComponent(eventId)}/attendees`,
    );
  }

  removeAttendee(eventId: string, agentId: string): Promise<void> {
    return this.http.delete<void>(
      `/events/${encodeURIComponent(eventId)}/attendees/${encodeURIComponent(agentId)}`,
    );
  }

  invite(eventId: string, agentId: string): Promise<void> {
    return this.http.post<void>(
      `/events/${encodeURIComponent(eventId)}/invite`,
      { agentId },
    );
  }

  start(eventId: string): Promise<Event> {
    return this.http.post<Event>(`/events/${encodeURIComponent(eventId)}/start`);
  }

  end(eventId: string): Promise<Event> {
    return this.http.post<Event>(`/events/${encodeURIComponent(eventId)}/end`);
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
    return this.http.post<EventStageMessage>(
      `/events/${encodeURIComponent(eventId)}/stage`,
      body,
    );
  }

  pauseStage(eventId: string): Promise<Event> {
    return this.http.post<Event>(`/events/${encodeURIComponent(eventId)}/stage/pause`);
  }

  resumeStage(eventId: string): Promise<Event> {
    return this.http.post<Event>(`/events/${encodeURIComponent(eventId)}/stage/resume`);
  }

  questions(eventId: string): Promise<{ questions: Array<EventQuestion> }> {
    return this.http.get<{ questions: Array<EventQuestion> }>(
      `/events/${encodeURIComponent(eventId)}/questions`,
    );
  }

  polls(eventId: string): Promise<{ polls: Array<EventPoll> }> {
    return this.http.get<{ polls: Array<EventPoll> }>(
      `/events/${encodeURIComponent(eventId)}/polls`,
    );
  }

  recording(eventId: string): Promise<EventRecording> {
    return this.http.get<EventRecording>(`/events/${encodeURIComponent(eventId)}/recording`);
  }

  listSeries(): Promise<{ series: Array<EventSeries> }> {
    return this.http.get<{ series: Array<EventSeries> }>("/events/series");
  }

  createSeries(series: Partial<EventSeries>): Promise<EventSeries> {
    return this.http.post<EventSeries>("/events/series", series);
  }

  getSeries(seriesId: string): Promise<EventSeries> {
    return this.http.get<EventSeries>(`/events/series/${encodeURIComponent(seriesId)}`);
  }

  followSeries(seriesId: string): Promise<void> {
    return this.http.post<void>(`/events/series/${encodeURIComponent(seriesId)}/follow`);
  }

  unfollowSeries(seriesId: string): Promise<void> {
    return this.http.delete<void>(`/events/series/${encodeURIComponent(seriesId)}/follow`);
  }
}
