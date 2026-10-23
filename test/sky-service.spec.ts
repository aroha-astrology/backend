import { describe, it, expect, vi, beforeEach } from 'vitest';

type Post = {
  id: string;
  room: string;
  authorUserId: string;
  body: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'REMOVED';
  checkReason: string | null;
  reviewedBy: string | null;
  reportCount: number;
  createdAt: Date;
  decidedAt: Date | null;
};

const world = vi.hoisted(() => ({
  moon: new Map<string, string | null>(),
  posts: [] as any[],
  reports: [] as Array<{ postId: string; reporter: string; reason: string }>,
  blocks: [] as Array<{ blocker: string; blocked: string }>,
  seq: 0,
}));

vi.mock('../src/lib/llm/gemini-client', () => ({ generate: async () => '{"verdict":"ok"}' }));

vi.mock('../src/modules/sky/sky.repo', () => ({
  moonSignOf: async (u: string) => world.moon.get(u) ?? null,
  countRecentPosts: async (u: string, since: Date) =>
    world.posts.filter((p) => p.authorUserId === u && p.createdAt > since).length,
  insertPost: async (v: { room: string; authorUserId: string; body: string }) => {
    const row = {
      id: `p${++world.seq}`,
      ...v,
      status: 'PENDING',
      checkReason: null,
      reviewedBy: null,
      reportCount: 0,
      createdAt: new Date(),
      decidedAt: null,
    };
    world.posts.push(row);
    return row;
  },
  decidePost: async (id: string, status: string, reason: string | null, by: string | null) => {
    const p = world.posts.find((x) => x.id === id);
    if (!p) return undefined;
    Object.assign(p, { status, checkReason: reason, reviewedBy: by, decidedAt: status === 'PENDING' ? null : new Date() });
    return p;
  },
  getPost: async (id: string) => world.posts.find((p) => p.id === id),
  listRoomPosts: async (room: string, viewer: string) =>
    world.posts.filter((p) => {
      if (p.room !== room) return false;
      if (p.authorUserId === viewer) return ['PENDING', 'APPROVED', 'REJECTED'].includes(p.status);
      if (p.status !== 'APPROVED') return false;
      if (world.blocks.some((b) => b.blocker === viewer && b.blocked === p.authorUserId)) return false;
      if (world.reports.some((r) => r.postId === p.id && r.reporter === viewer)) return false;
      return true;
    }),
  insertReport: async (postId: string, reporter: string, reason: string) => {
    if (world.reports.some((r) => r.postId === postId && r.reporter === reporter)) return false;
    world.reports.push({ postId, reporter, reason });
    return true;
  },
  recountReports: async (postId: string) => {
    const n = world.reports.filter((r) => r.postId === postId).length;
    const p = world.posts.find((x) => x.id === postId);
    if (p) p.reportCount = n;
    return n;
  },
  insertBlock: async (blocker: string, blocked: string) => {
    world.blocks.push({ blocker, blocked });
  },
  deleteBlock: async (blocker: string, blocked: string) => {
    world.blocks = world.blocks.filter((b) => !(b.blocker === blocker && b.blocked === blocked));
  },
  deleteOwnPost: async (id: string, author: string) => {
    const i = world.posts.findIndex((p) => p.id === id && p.authorUserId === author);
    if (i < 0) return false;
    world.posts.splice(i, 1);
    return true;
  },
  listQueue: async () =>
    world.posts
      .filter((p) => p.status === 'PENDING' || (p.status === 'APPROVED' && p.reportCount > 0))
      .map((post) => ({ post, reasons: world.reports.filter((r) => r.postId === post.id).map((r) => r.reason) })),
  queueSize: async () =>
    world.posts.filter((p) => p.status === 'PENDING' || (p.status === 'APPROVED' && p.reportCount > 0)).length,
}));

import {
  adminDecide,
  adminQueue,
  blockAuthor,
  createPost,
  getRoom,
  reportPost,
  unblockAuthor,
} from '../src/modules/sky/sky.service';

const ok = async () => ({ verdict: 'approve' as const, reason: 'ok' });
const hold = async () => ({ verdict: 'hold' as const, reason: 'model:unsure' });
const deps = (moderate = ok) => ({ moderate, now: () => new Date() });

async function approvedPost(author: string, body = 'Such a gentle Moon today') {
  const r = await createPost(author, body, deps());
  return r.post.id;
}

beforeEach(() => {
  world.moon = new Map([
    ['ana', 'Taurus'],
    ['bo', 'Taurus'],
    ['cy', 'Taurus'],
    ['di', 'Taurus'],
    ['ed', 'Leo'],
    ['nomoon', null],
  ]);
  world.posts = [];
  world.reports = [];
  world.blocks = [];
  world.seq = 0;
});

describe('createPost', () => {
  it('every post starts PENDING and is published only when the check passes', async () => {
    const r = await createPost('ana', 'Such a gentle Moon today', deps());
    expect(r.outcome).toBe('APPROVED');
    expect(r.post.status).toBe('APPROVED');
    expect(world.posts[0].reviewedBy).toBe('auto');
  });

  it('a post the check is unsure about waits in the admin queue', async () => {
    const r = await createPost('ana', 'Thinking about money a lot', deps(hold));
    expect(r.outcome).toBe('PENDING');
    expect(world.posts[0].status).toBe('PENDING');
    expect(world.posts[0].decidedAt).toBeNull();
    expect((await adminQueue()).total).toBe(1);
  });

  it('a post with a link or phone number is rejected before any model sees it', async () => {
    const moderate = vi.fn(ok);
    const r = await createPost('ana', 'call me on 98765 43210', deps(moderate));
    expect(r.outcome).toBe('REJECTED');
    expect(r.reason).toBe('phone');
    expect(moderate).not.toHaveBeenCalled();
  });

  it('writes into the room of the reader\'s own Moon sign', async () => {
    await createPost('ed', 'Lion energy today', deps());
    expect(world.posts[0].room).toBe('leo');
  });

  it('refuses a reader who has no Moon sign yet', async () => {
    await expect(createPost('nomoon', 'hello there', deps())).rejects.toMatchObject({ message: 'NO_ROOM' });
  });

  it('refuses a post that is too short', async () => {
    await expect(createPost('ana', 'hi', deps())).rejects.toMatchObject({ code: 'UNPROCESSABLE' });
  });

  it('allows three posts a day and then asks the reader to wait', async () => {
    for (let i = 0; i < 3; i++) await createPost('ana', `A calm thought number ${i}`, deps());
    await expect(createPost('ana', 'One more thought', deps())).rejects.toMatchObject({
      message: 'SKY_DAILY_LIMIT',
    });
  });
});

describe('getRoom', () => {
  it('shows a reader their room: published posts of others, and their own in any state', async () => {
    await createPost('bo', 'Bo says hello to the room', deps());
    await createPost('cy', 'Cy waits for a person', deps(hold));
    await createPost('ana', 'Ana waits too', deps(hold));
    await createPost('ed', 'A Leo post, another room', deps());
    const room = await getRoom('ana');
    expect(room.room).toBe('taurus');
    expect(room.posts.map((p) => p.body).sort()).toEqual(['Ana waits too', 'Bo says hello to the room']);
    const mine = room.posts.find((p) => p.mine)!;
    expect(mine.status).toBe('PENDING');
    const theirs = room.posts.find((p) => !p.mine)!;
    expect(theirs.status).toBeNull();
    expect(room.postsLeftToday).toBe(2);
  });

  it('never exposes who wrote a post', async () => {
    await createPost('bo', 'Bo says hello to the room', deps());
    const room = await getRoom('ana');
    const json = JSON.stringify(room);
    expect(json).not.toContain('"bo"');
    expect(json).not.toContain('authorUserId');
    expect(room.posts[0]!.handle).toMatch(/^Reader [0-9A-F]{4}$/);
  });

  it('a reader without a Moon sign has no room', async () => {
    expect(await getRoom('nomoon')).toEqual({ room: null, posts: [], postsLeftToday: 0 });
  });
});

describe('reports and blocks', () => {
  it('a reported post disappears for the reporter at once', async () => {
    const id = await approvedPost('bo');
    await reportPost('ana', id, 'harassment');
    expect((await getRoom('ana')).posts).toHaveLength(0);
    expect((await getRoom('cy')).posts).toHaveLength(1);
  });

  it('three different readers pull an approved post back to the admin queue', async () => {
    const id = await approvedPost('bo');
    expect((await reportPost('ana', id, 'spam')).hidden).toBe(false);
    expect((await reportPost('cy', id, 'spam')).hidden).toBe(false);
    expect((await reportPost('di', id, 'hate')).hidden).toBe(true);
    expect(world.posts[0].status).toBe('PENDING');
    expect((await getRoom('ana')).posts).toHaveLength(0);
    const q = await adminQueue();
    expect(q.items[0]).toMatchObject({ id, reportCount: 3, reasons: ['spam', 'spam', 'hate'] });
  });

  it('the same reader reporting twice counts once', async () => {
    const id = await approvedPost('bo');
    await reportPost('ana', id, 'spam');
    await reportPost('ana', id, 'spam');
    expect(world.posts[0].reportCount).toBe(1);
  });

  it('you cannot report your own post, nor a post from another room', async () => {
    const id = await approvedPost('bo');
    await expect(reportPost('bo', id, 'spam')).rejects.toMatchObject({ message: 'OWN_POST' });
    await expect(reportPost('ed', id, 'spam')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('blocking an author hides all of their posts, and can be undone', async () => {
    const first = await approvedPost('bo', 'First from Bo today');
    await approvedPost('bo', 'Second from Bo today');
    await approvedPost('cy', 'Cy is still visible');
    await blockAuthor('ana', first);
    expect((await getRoom('ana')).posts.map((p) => p.body)).toEqual(['Cy is still visible']);
    await unblockAuthor('ana', first);
    expect((await getRoom('ana')).posts).toHaveLength(3);
  });

  it('you cannot block yourself', async () => {
    const id = await approvedPost('bo');
    await expect(blockAuthor('bo', id)).rejects.toMatchObject({ message: 'OWN_POST' });
  });
});

describe('admin queue', () => {
  it('approve, reject and remove set the post state and record who decided', async () => {
    await createPost('ana', 'Waiting one', deps(hold));
    await createPost('bo', 'Waiting two', deps(hold));
    await createPost('cy', 'Waiting three', deps(hold));
    await adminDecide('p1', 'approve', '+911111');
    await adminDecide('p2', 'reject', '+911111');
    await adminDecide('p3', 'remove', '+911111');
    expect(world.posts.map((p) => p.status)).toEqual(['APPROVED', 'REJECTED', 'REMOVED']);
    expect(world.posts[0].reviewedBy).toBe('+911111');
    expect((await adminQueue()).total).toBe(0);
  });

  it('a removed post vanishes from every room, including the author\'s', async () => {
    const id = await approvedPost('bo');
    await adminDecide(id, 'remove', '+911111');
    expect((await getRoom('ana')).posts).toHaveLength(0);
    expect((await getRoom('bo')).posts).toHaveLength(0);
  });

  it('an unknown post is not found', async () => {
    await expect(adminDecide('nope', 'approve', 'x')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
