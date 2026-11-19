import {
  ChatMessageData,
  LiveStreamData,
  MatchHighlightData,
  PollData,
  TeamData,
} from '../../types/index.ts';
import { adminApi, customerApi, publicApi } from '../api/httpClient.ts';

export const engagementService = {
  // Highlights
  async listHighlights(streamId: string): Promise<MatchHighlightData[]> {
    const { data } = await publicApi.get<{ highlights: MatchHighlightData[] }>(
      `/live/${streamId}/highlights`
    );
    return data.highlights;
  },

  async createHighlight(
    streamId: string,
    payload: {
      eventType: string;
      videoTimestampSeconds: number;
      description?: string;
      teamSide?: 'A' | 'B' | '';
      playerId?: string | null;
      playerName?: string;
    }
  ): Promise<MatchHighlightData> {
    const { data } = await adminApi.post<{ highlight: MatchHighlightData }>(
      `/live/${streamId}/highlights`,
      payload
    );
    return data.highlight;
  },

  async updateHighlight(
    highlightId: string,
    payload: Partial<MatchHighlightData>
  ): Promise<MatchHighlightData> {
    const { data } = await adminApi.patch<{ highlight: MatchHighlightData }>(
      `/highlights/${highlightId}`,
      payload
    );
    return data.highlight;
  },

  async deleteHighlight(highlightId: string): Promise<void> {
    await adminApi.delete(`/highlights/${highlightId}`);
  },

  // Live Match Chat
  async listChatMessages(streamId: string): Promise<ChatMessageData[]> {
    const { data } = await publicApi.get<{ messages: ChatMessageData[] }>(
      `/live/${streamId}/chat`
    );
    return data.messages;
  },

  async sendChatMessage(
    streamId: string,
    message: string,
    useAdminPortal = false
  ): Promise<ChatMessageData> {
    const client = useAdminPortal ? adminApi : customerApi;
    const { data } = await client.post<{ message: ChatMessageData }>(`/live/${streamId}/chat`, {
      message,
    });
    return data.message;
  },

  async reportChatMessage(messageId: string, reason?: string): Promise<{ reportedCount: number }> {
    const { data } = await customerApi.post<{ reportedCount: number }>(
      `/chat/${messageId}/report`,
      { reason }
    );
    return data;
  },

  async deleteChatMessage(messageId: string): Promise<void> {
    await adminApi.delete(`/chat/${messageId}`);
  },

  async muteChatUser(
    userId: string,
    payload: { minutes?: number; reason?: string; unmute?: boolean }
  ): Promise<void> {
    await adminApi.post(`/chat/mute/${userId}`, payload);
  },

  async getChatModerationQueue(): Promise<{
    flaggedMessages: ChatMessageData[];
    recentMessages: ChatMessageData[];
    mutedUsers: Array<{
      id: string;
      name: string;
      email: string;
      role: string;
      chatMutedUntil?: string;
      chatMutedReason?: string;
    }>;
  }> {
    const { data } = await adminApi.get('/admin/chat/moderation');
    return data;
  },

  // Polls
  async listPolls(streamId: string): Promise<PollData[]> {
    const { data } = await publicApi.get<{ polls: PollData[] }>(`/live/${streamId}/polls`);
    return data.polls;
  },

  async createPoll(
    streamId: string,
    payload: { question: string; options: string[] }
  ): Promise<PollData> {
    const { data } = await adminApi.post<{ poll: PollData }>(`/live/${streamId}/polls`, payload);
    return data.poll;
  },

  async votePoll(pollId: string, optionId: string): Promise<PollData> {
    const { data } = await customerApi.post<{ poll: PollData }>(`/polls/${pollId}/vote`, {
      optionId,
    });
    return data.poll;
  },

  async closePoll(pollId: string): Promise<PollData> {
    const { data } = await adminApi.patch<{ poll: PollData }>(`/polls/${pollId}/close`);
    return data.poll;
  },

  // Team Following
  async followTeam(
    teamId: string
  ): Promise<{ followed: boolean; followersCount: number; followedTeamIds: string[] }> {
    const { data } = await customerApi.post(`/teams/${teamId}/follow`);
    return data;
  },

  async unfollowTeam(
    teamId: string
  ): Promise<{ followed: boolean; followersCount: number; followedTeamIds: string[] }> {
    const { data } = await customerApi.delete(`/teams/${teamId}/follow`);
    return data;
  },

  async getFollowingFeed(): Promise<{
    teams: TeamData[];
    liveMatches: LiveStreamData[];
    upcomingMatches: LiveStreamData[];
    recentResults: LiveStreamData[];
  }> {
    const { data } = await customerApi.get('/customer/following');
    return data;
  },
};
