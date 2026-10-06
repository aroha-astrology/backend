// Daily Stories (flag `home.dailyStories`): the story ring on the Home avatar.
// The stories themselves are built in the frontend from routes that already
// exist; this module only keeps count of who opened them and who shared them,
// for the admin dashboard.

import { Errors } from '../../lib/errors.js';
import { todayForApp } from '../horoscope/horoscope.service.js';
import {
  countStoryUsersByKind,
  listStoryEventGroups,
  recordStoryEvent,
  type StoryEventGroup,
} from './stories.repo.js';

/** Order here is the order the stories play in, and the order the admin card lists them. */
export const STORY_IDS = ['panchang', 'hora', 'deity', 'gita'] as const;
export type StoryId = (typeof STORY_IDS)[number];

/** Mirrors the frontend's ShareTarget (lib/stories/types.ts). */
export const SHARE_CHANNELS = [
  'whatsappStatus',
  'whatsapp',
  'instagramStory',
  'instagram',
  'x',
  'sms',
  'copy',
  'system',
] as const;
export type ShareChannel = (typeof SHARE_CHANNELS)[number];

export const STORY_EVENT_KINDS = ['view', 'share'] as const;
export type StoryEventKind = (typeof STORY_EVENT_KINDS)[number];

export async function trackStoryEvent(
  userId: string,
  event: { kind: StoryEventKind; storyId: StoryId; channel?: ShareChannel },
): Promise<void> {
  if (event.kind === 'share' && !event.channel) throw Errors.badRequest('SHARE_CHANNEL_REQUIRED');
  await recordStoryEvent({
    userId,
    eventDate: todayForApp(),
    kind: event.kind,
    storyId: event.storyId,
    // A view has no channel; one sent by mistake must not split the day's view into two rows.
    channel: event.kind === 'share' ? event.channel! : '',
  });
}

export interface StoryStatsRow {
  storyId: StoryId;
  /** Different users who opened this story. */
  viewers: number;
  /** Share taps on this story. */
  shares: number;
  /** Channel → share taps on this story. */
  shareChannels: Record<string, number>;
}

export interface StoryStats {
  /** Different users who opened at least one story. */
  visitors: number;
  /** Story openings: each story counts once per user per day. */
  views: number;
  /** Different users who tapped a share option. */
  sharers: number;
  /** Share taps in all. */
  shares: number;
  /** Channel → share taps, across all stories. */
  shareChannels: Record<string, number>;
  stories: StoryStatsRow[];
}

/** Pure, so the arithmetic is tested without a database. */
export function summariseStoryEvents(
  groups: readonly StoryEventGroup[],
  usersByKind: ReadonlyArray<{ kind: string; users: number }>,
): StoryStats {
  const stories: StoryStatsRow[] = STORY_IDS.map((storyId) => ({
    storyId,
    viewers: 0,
    shares: 0,
    shareChannels: {},
  }));
  const shareChannels: Record<string, number> = {};
  let views = 0;
  let shares = 0;

  for (const group of groups) {
    const story = stories.find((s) => s.storyId === group.storyId);
    if (group.kind === 'view') {
      views += group.total;
      if (story) story.viewers += group.users;
    } else if (group.kind === 'share') {
      shares += group.total;
      shareChannels[group.channel] = (shareChannels[group.channel] ?? 0) + group.total;
      if (story) {
        story.shares += group.total;
        story.shareChannels[group.channel] =
          (story.shareChannels[group.channel] ?? 0) + group.total;
      }
    }
  }

  const usersOf = (kind: string) => usersByKind.find((u) => u.kind === kind)?.users ?? 0;
  return {
    visitors: usersOf('view'),
    views,
    sharers: usersOf('share'),
    shares,
    shareChannels,
    stories,
  };
}

export async function storyStats(range: { from: Date; to: Date }): Promise<StoryStats> {
  const [groups, usersByKind] = await Promise.all([
    listStoryEventGroups(range),
    countStoryUsersByKind(range),
  ]);
  return summariseStoryEvents(groups, usersByKind);
}
