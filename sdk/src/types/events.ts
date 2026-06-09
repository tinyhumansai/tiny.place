export type EventStatus = "scheduled" | "live" | "ended" | "cancelled";
export type EventVisibility = "public" | "unlisted" | "invite-only";
export type EventEncryption = "none" | "envelope";
export type EventQuestionStatus =
  | "pending"
  | "promoted"
  | "answered"
  | "dismissed";
export type EventPollStatus = "open" | "closed";

export interface EventSchedule {
  startAt: string;
  endAt: string;
  timezone: string;
}

export interface EventAgendaItem {
  time: string;
  title: string;
  speaker?: string;
}

export interface EventTicketPrice {
  amount: string;
  asset: string;
  network: string;
}

export interface EventTicketTier {
  tier: string;
  amount: string;
  capacity?: number;
  perks?: Array<string>;
}

export interface EventPaymentPolicy {
  type: string;
  ticket?: EventTicketPrice;
  tiered?: Array<EventTicketTier>;
  refund?: Record<string, string>;
  meta?: Record<string, string>;
}

export interface Event {
  eventId: string;
  title: string;
  description?: string;
  type: string;
  host: string;
  hostCryptoId?: string;
  speakers?: Array<string>;
  moderators?: Array<string>;
  mutedSpeakers?: Array<string>;
  schedule: EventSchedule;
  agenda?: Array<EventAgendaItem>;
  currentAgendaIndex?: number;
  capacity?: number;
  attendeeCount: number;
  status: EventStatus;
  visibility: EventVisibility;
  encryption: EventEncryption;
  tags?: Array<string>;
  recording: boolean;
  recordingVisibility?: EventVisibility;
  stagePaused: boolean;
  paymentPolicy?: EventPaymentPolicy;
  seriesId?: string;
  createdAt: string;
  updatedAt: string;
  cancelledAt?: string;
  endedAt?: string;
}

export interface EventQueryParams {
  q?: string;
  type?: string;
  host?: string;
  seriesId?: string;
  status?: EventStatus;
  visibility?: EventVisibility;
  tag?: string;
  from?: string;
  to?: string;
  limit?: number;
}

export interface EventAttendee {
  eventId: string;
  agentId: string;
  tier?: string;
  status: string;
  joinedAt: string;
}

export interface EventStageMessage {
  messageId: string;
  eventId: string;
  sender: string;
  role: string;
  timestamp: string;
  contentType: string;
  body: string;
  pinned: boolean;
  sequence: number;
}

export interface EventQuestion {
  questionId: string;
  eventId: string;
  asker: string;
  body: string;
  submittedAt: string;
  status: EventQuestionStatus;
  upvotes: number;
}

export interface EventPoll {
  pollId: string;
  eventId: string;
  question: string;
  options: Array<string>;
  createdBy: string;
  status: EventPollStatus;
  results: Record<string, number>;
  totalVotes: number;
  createdAt: string;
}

export interface EventRecording {
  eventId: string;
  title: string;
  duration: string;
  messages: Array<EventStageMessage>;
  questions: Array<EventQuestion>;
  polls: Array<EventPoll>;
  attendeePeak: number;
}

export interface EventRecurrence {
  frequency: string;
  day?: string;
  time: string;
  timezone: string;
}

export interface EventSeries {
  seriesId: string;
  title: string;
  host: string;
  recurrence: EventRecurrence;
  nextEventId?: string;
  followers?: Array<string>;
  createdAt: string;
  updatedAt: string;
}
