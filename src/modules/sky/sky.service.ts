// =============================================================================
// Same Sky rooms — posting, the automatic check, reports, blocks and the admin queue
// =============================================================================
// Switch (off): community.sameSky. Every post starts PENDING; the automatic check publishes it (APPROVED),
// leaves it for the admin queue (PENDING) or refuses it (REJECTED). See sky-rules.ts.
// =============================================================================

import { generate } from '../../lib/llm/gemini-client.js';
import { FACT_EXTRACTION_PROFILE } from '../../config/llm.js';
import { Errors } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import {
  MAX_POSTS_PER_DAY,
  MAX_REPORT_REASON_CHARS,
  MODERATION_PROMPT,
  REPORTS_TO_HIDE,
  REPORT_REASONS,
  anonymousHandle,
  cleanBody,
  parseModelVerdict,
  roomForMoonSign,
  ruleCheck,
  type CheckResult,
  type PostStatus,
  type Room,
} from './sky-rules.js';
import {
  countRecentPosts,
  decidePost,
  deleteBlock,
  deleteOwnPost,
  getPost,
  insertBlock,
  insertPost,
  insertReport,
  listQueue,
  listRoomPosts,
  moonSignOf,
  queueSize,
  recountReports,
  type SkyPostRow,
} from './sky.repo.js';

export interface SkyPostView {
  id: string;
  handle: string;
  mine: boolean;
  body: string;
  /** Only the author sees a state other than published. */
  status: PostStatus | null;
  createdAt: string;
}

export interface SkyRoomView {
  room: Room | null;
  posts: SkyPostView[];
  postsLeftToday: number;
}

function toView(row: SkyPostRow, viewerId: string): SkyPostView {
  const mine = row.authorUserId === viewerId;
  return {
    id: row.id,
    handle: anonymousHandle(row.authorUserId, row.room),
    mine,
    body: row.body,
    status: mine ? row.status : null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** The reader's room and its posts. A reader without a natal Moon yet has no room. */
export async function getRoom(
  viewerId: string,
  opts: { before?: Date; now?: Date } = {},
): Promise<SkyRoomView> {
  const now = opts.now ?? new Date();
  const room = roomForMoonSign(await moonSignOf(viewerId));
  if (!room) return { room: null, posts: [], postsLeftToday: 0 };
  const posts = await listRoomPosts(room, viewerId, 30, opts.before);
  const used = await countRecentPosts(viewerId, new Date(now.getTime() - 86_400_000));
  return {
    room,
    posts: posts.map((p) => toView(p, viewerId)),
    postsLeftToday: Math.max(0, MAX_POSTS_PER_DAY - used),
  };
}

/** The model half of the check. Any failure is a hold: an unchecked post never goes live. */
export async function moderateWithModel(body: string, userId: string): Promise<CheckResult> {
  try {
    const raw = await generate({
      profile: FACT_EXTRACTION_PROFILE,
      messages: [
        { role: 'system', content: MODERATION_PROMPT },
        { role: 'user', content: `<post>${body}</post>` },
      ],
      userId,
    });
    return parseModelVerdict(raw);
  } catch (err) {
    logger.warn({ err }, 'sky: model check failed, holding the post');
    return { verdict: 'hold', reason: 'model-unavailable' };
  }
}

export interface SkyDeps {
  moderate: (body: string, userId: string) => Promise<CheckResult>;
  now: () => Date;
}

const defaultDeps: SkyDeps = { moderate: moderateWithModel, now: () => new Date() };

/** The automatic check: the fixed rules first, the model only when they have nothing to say. */
export async function checkPost(body: string, userId: string, moderate = defaultDeps.moderate): Promise<CheckResult> {
  return ruleCheck(body) ?? (await moderate(body, userId));
}

export interface CreatePostResult {
  post: SkyPostView;
  /** 'PENDING' = waiting for a person; 'REJECTED' = never shown. */
  outcome: PostStatus;
  reason: string;
}

export async function createPost(
  authorId: string,
  rawBody: string,
  deps: SkyDeps = defaultDeps,
): Promise<CreatePostResult> {
  const room = roomForMoonSign(await moonSignOf(authorId));
  if (!room) throw Errors.conflict('NO_ROOM');

  const body = cleanBody(rawBody);
  if (!body) throw Errors.unprocessable('A post is 3 to 280 characters');

  const used = await countRecentPosts(authorId, new Date(deps.now().getTime() - 86_400_000));
  if (used >= MAX_POSTS_PER_DAY) throw Errors.tooManyRequests('SKY_DAILY_LIMIT');

  const row = await insertPost({ room, authorUserId: authorId, body });
  const check = await checkPost(body, authorId, deps.moderate);
  const status: PostStatus =
    check.verdict === 'approve' ? 'APPROVED' : check.verdict === 'reject' ? 'REJECTED' : 'PENDING';
  const decided = (await decidePost(row.id, status, check.reason, 'auto')) ?? row;
  return { post: toView({ ...decided, status }, authorId), outcome: status, reason: check.reason };
}

export async function removeOwnPost(authorId: string, postId: string): Promise<boolean> {
  return deleteOwnPost(postId, authorId);
}

/**
 * A reader reports a post. The reporter stops seeing it at once; REPORTS_TO_HIDE different readers pull an
 * approved post back to the admin queue. Reporting your own post, or one you cannot see, is refused.
 */
export async function reportPost(
  reporterId: string,
  postId: string,
  reason: string,
): Promise<{ hidden: boolean }> {
  const post = await getPost(postId);
  if (!post || post.status === 'REJECTED' || post.status === 'REMOVED') throw Errors.notFound('Post not found');
  if (post.authorUserId === reporterId) throw Errors.conflict('OWN_POST');
  const myRoom = roomForMoonSign(await moonSignOf(reporterId));
  if (myRoom !== post.room) throw Errors.notFound('Post not found');

  const clean = (REPORT_REASONS as readonly string[]).includes(reason)
    ? reason
    : reason.slice(0, MAX_REPORT_REASON_CHARS) || 'other';
  await insertReport(postId, reporterId, clean);
  const n = await recountReports(postId);
  let hidden = false;
  if (post.status === 'APPROVED' && n >= REPORTS_TO_HIDE) {
    await decidePost(postId, 'PENDING', 'reported', 'auto');
    hidden = true;
  }
  return { hidden };
}

/** Blocks the author of a post the reader can see; the author is never named to the reader. */
export async function blockAuthor(blockerId: string, postId: string): Promise<void> {
  const post = await getPost(postId);
  if (!post) throw Errors.notFound('Post not found');
  if (post.authorUserId === blockerId) throw Errors.conflict('OWN_POST');
  await insertBlock(blockerId, post.authorUserId);
}

export async function unblockAuthor(blockerId: string, postId: string): Promise<void> {
  const post = await getPost(postId);
  if (!post) throw Errors.notFound('Post not found');
  await deleteBlock(blockerId, post.authorUserId);
}

/* -------------------------------------------------------------------------- */
/* Admin queue                                                                 */
/* -------------------------------------------------------------------------- */

export interface QueueItemView {
  id: string;
  room: string;
  handle: string;
  body: string;
  status: PostStatus;
  checkReason: string | null;
  reportCount: number;
  reasons: string[];
  createdAt: string;
}

export async function adminQueue(limit = 100): Promise<{ total: number; items: QueueItemView[] }> {
  const [rows, total] = await Promise.all([listQueue(limit), queueSize()]);
  return {
    total,
    items: rows.map(({ post, reasons }) => ({
      id: post.id,
      room: post.room,
      handle: anonymousHandle(post.authorUserId, post.room),
      body: post.body,
      status: post.status,
      checkReason: post.checkReason,
      reportCount: post.reportCount,
      reasons,
      createdAt: post.createdAt.toISOString(),
    })),
  };
}

export type AdminAction = 'approve' | 'reject' | 'remove';
const STATUS_BY_ACTION: Record<AdminAction, PostStatus> = {
  approve: 'APPROVED',
  reject: 'REJECTED',
  remove: 'REMOVED',
};

export async function adminDecide(postId: string, action: AdminAction, adminLabel: string): Promise<void> {
  const post = await getPost(postId);
  if (!post) throw Errors.notFound('Post not found');
  await decidePost(postId, STATUS_BY_ACTION[action], `admin:${action}`, adminLabel);
}
