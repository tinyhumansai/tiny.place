import {
	useMutation,
	useQuery,
	useQueryClient,
	type UseMutationResult,
	type UseQueryResult,
} from "@tanstack/react-query";
import {
	signX402Authorization,
	TinyPlaceError,
	x402AuthorizationToPaymentMap,
	type Event,
	type EventAttendee,
	type EventPoll,
	type EventQueryParams,
	type EventQuestion,
	type EventRecording,
	type EventSeries,
	type EventStageMessage,
	type EventVisibility,
	type X402AuthorizationFields,
} from "@tinyhumansai/tinyplace";

import { useApiClient } from "@src/common/api-context";
import { queryKeys } from "@src/common/query-keys";
import { assertValidX402Challenge } from "@src/common/x402-challenge";
import { useAuthStore } from "@src/store/auth";

type EventPaymentChallenge = {
	error: string;
	payment: Omit<X402AuthorizationFields, "expiresAt" | "nonce"> &
		Partial<Pick<X402AuthorizationFields, "expiresAt" | "nonce">>;
};

function eventPaymentChallenge(error: unknown): EventPaymentChallenge | null {
	if (!(error instanceof TinyPlaceError) || error.status !== 402) {
		return null;
	}
	if (!error.body || typeof error.body !== "object") {
		return null;
	}
	const body = error.body as Partial<EventPaymentChallenge>;
	if (!body.payment || typeof body.payment !== "object") {
		return null;
	}
	return {
		error: body.error ?? "Payment required",
		payment: body.payment,
	};
}

function invalidateEvent(
	queryClient: ReturnType<typeof useQueryClient>,
	eventId: string
): void {
	void queryClient.invalidateQueries({ queryKey: queryKeys.events.list() });
	void queryClient.invalidateQueries({
		queryKey: queryKeys.events.detail(eventId),
	});
}

function useEventAction<TData, TVariables extends { eventId: string }>(
	mutationFn: (variables: TVariables) => Promise<TData>,
	afterSuccess?: (
		queryClient: ReturnType<typeof useQueryClient>,
		data: TData,
		variables: TVariables
	) => void
): UseMutationResult<TData, Error, TVariables> {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn,
		onSuccess: (data, variables): void => {
			invalidateEvent(queryClient, variables.eventId);
			afterSuccess?.(queryClient, data, variables);
		},
	});
}

export function useEvents(
	parameters?: EventQueryParams
): UseQueryResult<{ events: Array<Event> }> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.events.list(parameters),
		queryFn: async (): Promise<{ events: Array<Event> }> => {
			const result = await client.events.list(parameters);
			return { events: result.events ?? [] };
		},
	});
}

export function useEvent(eventId: string): UseQueryResult<Event> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.events.detail(eventId),
		queryFn: (): Promise<Event> => client.events.get(eventId),
		enabled: Boolean(eventId),
	});
}

export function useEventAttendees(
	eventId: string,
	actorId?: string
): UseQueryResult<{ attendees: Array<EventAttendee> }> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.events.attendees(eventId),
		queryFn: (): Promise<{ attendees: Array<EventAttendee> }> =>
			client.events.attendees(eventId, actorId),
		enabled: Boolean(eventId),
	});
}

export function useEventStage(
	eventId: string
): UseQueryResult<{ messages: Array<EventStageMessage> }> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.events.stage(eventId),
		queryFn: (): Promise<{ messages: Array<EventStageMessage> }> =>
			client.events.getStage(eventId),
		enabled: Boolean(eventId),
	});
}

export function useEventQuestions(
	eventId: string
): UseQueryResult<{ questions: Array<EventQuestion> }> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.events.questions(eventId),
		queryFn: (): Promise<{ questions: Array<EventQuestion> }> =>
			client.events.questions(eventId),
		enabled: Boolean(eventId),
	});
}

export function useEventPolls(
	eventId: string
): UseQueryResult<{ polls: Array<EventPoll> }> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.events.polls(eventId),
		queryFn: (): Promise<{ polls: Array<EventPoll> }> =>
			client.events.polls(eventId),
		enabled: Boolean(eventId),
	});
}

export function useEventRecording(
	eventId: string
): UseQueryResult<EventRecording> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.events.recording(eventId),
		queryFn: (): Promise<EventRecording> => client.events.recording(eventId),
		enabled: Boolean(eventId),
	});
}

export function useEventSeries(): UseQueryResult<{
	series: Array<EventSeries>;
}> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.events.series(),
		queryFn: (): Promise<{ series: Array<EventSeries> }> =>
			client.events.listSeries(),
	});
}

export function useEventSeriesDetail(
	seriesId: string
): UseQueryResult<EventSeries> {
	const client = useApiClient();
	return useQuery({
		queryKey: queryKeys.events.seriesDetail(seriesId),
		queryFn: (): Promise<EventSeries> => client.events.getSeries(seriesId),
		enabled: Boolean(seriesId),
	});
}

export function useCreateEvent(): UseMutationResult<
	Event,
	Error,
	Partial<Event>
> {
	const client = useApiClient();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (event): Promise<Event> => client.events.create(event),
		onSuccess: (event): void => {
			void queryClient.invalidateQueries({ queryKey: queryKeys.events.list() });
			void queryClient.invalidateQueries({
				queryKey: queryKeys.events.detail(event.eventId),
			});
		},
	});
}

export function useUpdateEvent(): UseMutationResult<
	Event,
	Error,
	{ event: Partial<Event>; eventId: string; hostId?: string }
> {
	const client = useApiClient();
	return useEventAction(
		({ event, eventId, hostId }): Promise<Event> =>
			client.events.update(eventId, event, hostId)
	);
}

export function useDeleteEvent(): UseMutationResult<
	void,
	Error,
	{ eventId: string; hostId?: string }
> {
	const client = useApiClient();
	return useEventAction(
		({ eventId, hostId }): Promise<void> =>
			client.events.remove(eventId, hostId)
	);
}

export function useRsvpEvent(): UseMutationResult<
	EventAttendee,
	Error,
	{ eventId: string; ticketType?: string }
> {
	const client = useApiClient();
	const agentId = useAuthStore((state) => state.agentId);
	const signer = useAuthStore((state) => state.signer);
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async ({ eventId, ticketType }): Promise<EventAttendee> => {
			if (!agentId) {
				throw new Error("Connect your wallet first");
			}
			try {
				return await client.events.rsvp(eventId, {
					agentId,
					tier: ticketType,
				});
			} catch (error) {
				const challenge = eventPaymentChallenge(error);
				if (!challenge) {
					throw error;
				}
				if (!signer) {
					throw new Error("Connect your wallet first");
				}
				const challengePayment = challenge.payment;
				assertValidX402Challenge(challengePayment);
				const signedPayment = await signX402Authorization(signer, {
					...challengePayment,
					expiresAt: challengePayment.expiresAt ?? "",
					from: challengePayment.from || agentId,
					metadata: challengePayment.metadata,
					nonce: challengePayment.nonce ?? "",
				});
				return client.events.rsvp(eventId, {
					agentId,
					payment: x402AuthorizationToPaymentMap(signedPayment),
					tier: ticketType,
				});
			}
		},
		onSuccess: (attendee): void => {
			void queryClient.invalidateQueries({ queryKey: queryKeys.events.list() });
			void queryClient.invalidateQueries({
				queryKey: queryKeys.events.detail(attendee.eventId),
			});
		},
	});
}

export function useRemoveEventAttendee(): UseMutationResult<
	void,
	Error,
	{ agentId: string; eventId: string; moderatorId?: string }
> {
	const client = useApiClient();
	return useEventAction(
		({ agentId, eventId, moderatorId }): Promise<void> =>
			client.events.removeAttendee(eventId, agentId, moderatorId),
		(queryClient, _result, { eventId }): void => {
			void queryClient.invalidateQueries({
				queryKey: queryKeys.events.attendees(eventId),
			});
		}
	);
}

export function useInviteEventAgent(): UseMutationResult<
	void,
	Error,
	{ agentId: string; eventId: string; hostId?: string }
> {
	const client = useApiClient();
	return useEventAction(
		({ agentId, eventId, hostId }): Promise<void> =>
			client.events.invite(eventId, agentId, hostId)
	);
}

export function useStartEvent(): UseMutationResult<
	Event,
	Error,
	{ eventId: string; hostId?: string }
> {
	const client = useApiClient();
	return useEventAction(
		({ eventId, hostId }): Promise<Event> =>
			client.events.start(eventId, hostId)
	);
}

export function useEndEvent(): UseMutationResult<
	Event,
	Error,
	{ eventId: string; hostId?: string }
> {
	const client = useApiClient();
	return useEventAction(
		({ eventId, hostId }): Promise<Event> => client.events.end(eventId, hostId)
	);
}

export function usePostEventStageMessage(): UseMutationResult<
	EventStageMessage,
	Error,
	{
		actorId?: string;
		body: {
			body?: string;
			message?: string;
			sender?: string;
			speaker?: string;
		};
		eventId: string;
	}
> {
	const client = useApiClient();
	return useEventAction(
		({ actorId, body, eventId }): Promise<EventStageMessage> =>
			client.events.postToStage(eventId, body, actorId),
		(queryClient, _message, { eventId }): void => {
			void queryClient.invalidateQueries({
				queryKey: queryKeys.events.stage(eventId),
			});
		}
	);
}

export function usePauseEventStage(): UseMutationResult<
	Event,
	Error,
	{ eventId: string; moderatorId?: string }
> {
	const client = useApiClient();
	return useEventAction(
		({ eventId, moderatorId }): Promise<Event> =>
			client.events.pauseStage(eventId, moderatorId)
	);
}

export function useResumeEventStage(): UseMutationResult<
	Event,
	Error,
	{ eventId: string; moderatorId?: string }
> {
	const client = useApiClient();
	return useEventAction(
		({ eventId, moderatorId }): Promise<Event> =>
			client.events.resumeStage(eventId, moderatorId)
	);
}

export function usePinEventStageMessage(): UseMutationResult<
	Record<string, unknown>,
	Error,
	{
		body?: Record<string, unknown>;
		eventId: string;
		messageId: string;
		moderatorId?: string;
	}
> {
	const client = useApiClient();
	return useEventAction(
		({
			body,
			eventId,
			messageId,
			moderatorId,
		}): Promise<Record<string, unknown>> =>
			client.events.pinStageMessage(eventId, messageId, body, moderatorId),
		(queryClient, _result, { eventId }): void => {
			void queryClient.invalidateQueries({
				queryKey: queryKeys.events.stage(eventId),
			});
		}
	);
}

export function useUnpinEventStageMessage(): UseMutationResult<
	Record<string, unknown>,
	Error,
	{
		body?: Record<string, unknown>;
		eventId: string;
		messageId: string;
		moderatorId?: string;
	}
> {
	const client = useApiClient();
	return useEventAction(
		({
			body,
			eventId,
			messageId,
			moderatorId,
		}): Promise<Record<string, unknown>> =>
			client.events.unpinStageMessage(eventId, messageId, body, moderatorId),
		(queryClient, _result, { eventId }): void => {
			void queryClient.invalidateQueries({
				queryKey: queryKeys.events.stage(eventId),
			});
		}
	);
}

export function useAddEventSpeaker(): UseMutationResult<
	Event,
	Error,
	{ eventId: string; moderatorId?: string; speakerId: string }
> {
	const client = useApiClient();
	return useEventAction(
		({ eventId, moderatorId, speakerId }): Promise<Event> =>
			client.events.addSpeaker(eventId, speakerId, moderatorId)
	);
}

export function useRemoveEventSpeaker(): UseMutationResult<
	Event,
	Error,
	{ eventId: string; moderatorId?: string; speakerId: string }
> {
	const client = useApiClient();
	return useEventAction(
		({ eventId, moderatorId, speakerId }): Promise<Event> =>
			client.events.removeSpeaker(eventId, speakerId, moderatorId)
	);
}

export function useMuteEventSpeaker(): UseMutationResult<
	Record<string, unknown>,
	Error,
	{
		body?: Record<string, unknown>;
		eventId: string;
		moderatorId?: string;
		speakerId: string;
	}
> {
	const client = useApiClient();
	return useEventAction(({ body, eventId, moderatorId, speakerId }) =>
		client.events.muteSpeaker(eventId, speakerId, body, moderatorId)
	);
}

export function useUnmuteEventSpeaker(): UseMutationResult<
	Record<string, unknown>,
	Error,
	{
		body?: Record<string, unknown>;
		eventId: string;
		moderatorId?: string;
		speakerId: string;
	}
> {
	const client = useApiClient();
	return useEventAction(({ body, eventId, moderatorId, speakerId }) =>
		client.events.unmuteSpeaker(eventId, speakerId, body, moderatorId)
	);
}

export function useActivateEventAgendaItem(): UseMutationResult<
	Record<string, unknown>,
	Error,
	{
		agendaItemId: string;
		body?: Record<string, unknown>;
		eventId: string;
		moderatorId?: string;
	}
> {
	const client = useApiClient();
	return useEventAction(({ agendaItemId, body, eventId, moderatorId }) =>
		client.events.activateAgendaItem(eventId, agendaItemId, body, moderatorId)
	);
}

export function usePostEventQuestion(): UseMutationResult<
	Record<string, unknown>,
	Error,
	{ askerId?: string; eventId: string; question: Record<string, unknown> }
> {
	const client = useApiClient();
	return useEventAction(
		({ askerId, eventId, question }): Promise<Record<string, unknown>> =>
			client.events.postQuestion(eventId, question, askerId),
		(queryClient, _question, { eventId }): void => {
			void queryClient.invalidateQueries({
				queryKey: queryKeys.events.questions(eventId),
			});
		}
	);
}

export function useUpvoteEventQuestion(): UseMutationResult<
	Record<string, unknown>,
	Error,
	{
		body?: Record<string, unknown>;
		eventId: string;
		questionId: string;
		voterId?: string;
	}
> {
	const client = useApiClient();
	return useEventAction(
		({
			body,
			eventId,
			questionId,
			voterId,
		}): Promise<Record<string, unknown>> =>
			client.events.upvoteQuestion(eventId, questionId, body, voterId),
		(queryClient, _question, { eventId }): void => {
			void queryClient.invalidateQueries({
				queryKey: queryKeys.events.questions(eventId),
			});
		}
	);
}

export function usePromoteEventQuestion(): UseMutationResult<
	Record<string, unknown>,
	Error,
	{
		body?: Record<string, unknown>;
		eventId: string;
		moderatorId?: string;
		questionId: string;
	}
> {
	const client = useApiClient();
	return useEventAction(
		({
			body,
			eventId,
			moderatorId,
			questionId,
		}): Promise<Record<string, unknown>> =>
			client.events.promoteQuestion(eventId, questionId, body, moderatorId),
		(queryClient, _question, { eventId }): void => {
			void queryClient.invalidateQueries({
				queryKey: queryKeys.events.questions(eventId),
			});
			void queryClient.invalidateQueries({
				queryKey: queryKeys.events.stage(eventId),
			});
		}
	);
}

export function useDismissEventQuestion(): UseMutationResult<
	Record<string, unknown>,
	Error,
	{
		body?: Record<string, unknown>;
		eventId: string;
		moderatorId?: string;
		questionId: string;
	}
> {
	const client = useApiClient();
	return useEventAction(
		({
			body,
			eventId,
			moderatorId,
			questionId,
		}): Promise<Record<string, unknown>> =>
			client.events.dismissQuestion(eventId, questionId, body, moderatorId),
		(queryClient, _question, { eventId }): void => {
			void queryClient.invalidateQueries({
				queryKey: queryKeys.events.questions(eventId),
			});
		}
	);
}

export function useMarkEventQuestionAnswered(): UseMutationResult<
	EventQuestion,
	Error,
	{
		body?: Record<string, unknown>;
		eventId: string;
		moderatorId?: string;
		questionId: string;
	}
> {
	const client = useApiClient();
	return useEventAction(
		({ body, eventId, moderatorId, questionId }): Promise<EventQuestion> =>
			client.events.markQuestionAnswered(
				eventId,
				questionId,
				body,
				moderatorId
			),
		(queryClient, _question, { eventId }): void => {
			void queryClient.invalidateQueries({
				queryKey: queryKeys.events.questions(eventId),
			});
		}
	);
}

export function useCreateEventPoll(): UseMutationResult<
	EventPoll,
	Error,
	{ actorId?: string; eventId: string; poll: Partial<EventPoll> }
> {
	const client = useApiClient();
	return useEventAction(
		({ actorId, eventId, poll }): Promise<EventPoll> =>
			client.events.createPoll(eventId, poll, actorId),
		(queryClient, _poll, { eventId }): void => {
			void queryClient.invalidateQueries({
				queryKey: queryKeys.events.polls(eventId),
			});
		}
	);
}

export function useVoteEventPoll(): UseMutationResult<
	EventPoll,
	Error,
	{ eventId: string; option: string; pollId: string; voterId?: string }
> {
	const client = useApiClient();
	return useEventAction(
		({ eventId, option, pollId, voterId }): Promise<EventPoll> =>
			client.events.votePoll(eventId, pollId, option, voterId),
		(queryClient, _poll, { eventId }): void => {
			void queryClient.invalidateQueries({
				queryKey: queryKeys.events.polls(eventId),
			});
		}
	);
}

export function useCloseEventPoll(): UseMutationResult<
	EventPoll,
	Error,
	{ actorId?: string; eventId: string; pollId: string }
> {
	const client = useApiClient();
	return useEventAction(
		({ actorId, eventId, pollId }): Promise<EventPoll> =>
			client.events.closePoll(eventId, pollId, actorId),
		(queryClient, _poll, { eventId }): void => {
			void queryClient.invalidateQueries({
				queryKey: queryKeys.events.polls(eventId),
			});
		}
	);
}

export function useUpdateEventRecording(): UseMutationResult<
	Event,
	Error,
	{ eventId: string; hostId?: string; visibility: EventVisibility }
> {
	const client = useApiClient();
	return useEventAction(
		({ eventId, hostId, visibility }): Promise<Event> =>
			client.events.updateRecording(eventId, { visibility }, hostId),
		(queryClient, _event, { eventId }): void => {
			void queryClient.invalidateQueries({
				queryKey: queryKeys.events.recording(eventId),
			});
		}
	);
}

export function useCreateEventSeries(): UseMutationResult<
	EventSeries,
	Error,
	{ hostId?: string; series: Partial<EventSeries> }
> {
	const client = useApiClient();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ hostId, series }): Promise<EventSeries> =>
			client.events.createSeries(series, hostId),
		onSuccess: (series): void => {
			void queryClient.invalidateQueries({
				queryKey: queryKeys.events.series(),
			});
			void queryClient.invalidateQueries({
				queryKey: queryKeys.events.seriesDetail(series.seriesId),
			});
		},
	});
}

export function useFollowEventSeries(): UseMutationResult<
	void,
	Error,
	{ agentId?: string; seriesId: string }
> {
	const client = useApiClient();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ agentId, seriesId }): Promise<void> =>
			client.events.followSeries(seriesId, agentId),
		onSuccess: (_result, { seriesId }): void => {
			void queryClient.invalidateQueries({
				queryKey: queryKeys.events.series(),
			});
			void queryClient.invalidateQueries({
				queryKey: queryKeys.events.seriesDetail(seriesId),
			});
		},
	});
}

export function useUnfollowEventSeries(): UseMutationResult<
	void,
	Error,
	{ agentId?: string; seriesId: string }
> {
	const client = useApiClient();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ agentId, seriesId }): Promise<void> =>
			client.events.unfollowSeries(seriesId, agentId),
		onSuccess: (_result, { seriesId }): void => {
			void queryClient.invalidateQueries({
				queryKey: queryKeys.events.series(),
			});
			void queryClient.invalidateQueries({
				queryKey: queryKeys.events.seriesDetail(seriesId),
			});
		},
	});
}

export function useCancelEventRsvp(): UseMutationResult<
	void,
	Error,
	{ eventId: string }
> {
	const client = useApiClient();
	const agentId = useAuthStore((state) => state.agentId);
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ eventId }): Promise<void> => {
			if (!agentId) {
				throw new Error("Connect your wallet first");
			}
			return client.events.cancelRsvp(eventId, agentId);
		},
		onSuccess: (_result, variables): void => {
			void queryClient.invalidateQueries({ queryKey: queryKeys.events.list() });
			void queryClient.invalidateQueries({
				queryKey: queryKeys.events.detail(variables.eventId),
			});
		},
	});
}
