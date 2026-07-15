'use strict';
const db = require('../models');
const ApiError = require('../utils/ApiError');
const { publicProfile } = require('../serializers/publicProfile');
const { Op } = db.Sequelize;

const MAX_BODY = 2000;

const paginate = ({ page, limit }) => {
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
  const safePage = Math.max(parseInt(page, 10) || 1, 1);
  return { safeLimit, safePage, offset: (safePage - 1) * safeLimit };
};
const pageMeta = (count, safePage, safeLimit) => ({
  page: safePage,
  limit: safeLimit,
  total: count,
  totalPages: Math.ceil(count / safeLimit),
});

const toId = (value, label) => {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) throw new ApiError(400, `Invalid ${label} id`);
  return id;
};

const cleanBody = (body) => {
  const b = String(body || '').trim();
  if (!b) throw new ApiError(400, 'Comment cannot be empty');
  if (b.length > MAX_BODY) {
    throw new ApiError(400, `Comment must be ${MAX_BODY} characters or fewer`);
  }
  return b;
};

// THE eager-load that every public comment read must use.
//
// deleted_at is in the attributes list ON PURPOSE, and this is the single
// easiest thing to get wrong in the whole module. publicProfile() decides
// whether to render a tombstone by reading user.deleted_at — so if you omit it
// here, the field arrives undefined, the check silently passes, and a deleted
// user's real name renders on a public page. It fails open, and it fails
// quietly. There is no error to notice.
const authorInclude = {
  model: db.User,
  as: 'author',
  attributes: ['id', 'username', 'display_name', 'avatar_url', 'deleted_at'],
};

// ── Moderation model ─────────────────────────────────────────────────────────
//
// Two INDEPENDENT axes, and conflating them is the classic mistake:
//
//   deleted_at  — the AUTHOR withdrew it.    "I take it back."
//   status      — a MODERATOR hid it.        "You don't get to say that."
//
// They must stay separate because the answers to "can the author restore it?"
// differ: yes for their own delete, absolutely not for a moderator's hide. If
// you collapse both into one column, an author can un-hide their own moderated
// comment simply by editing it, and moderation means nothing.
//
// A hidden comment is NOT deleted. The row stays, the moderator who hid it is
// recorded in hidden_by_user_id, and it remains visible to moderators. That
// audit trail is the entire point — "who hid this, and when" must be answerable.

// Is this actor a moderator?
//
// requirePermission() attaches req.user.permissions — but ONLY on routes it
// guards. The public read route is deliberately ungated (anyone logged in may
// read comments), so on that path `permissions` is undefined and we must resolve
// the role ourselves.
//
// Without this fallback a moderator reading a song page would see the same
// '[removed by moderator]' tombstones as everyone else — unable to review, or
// reverse, their own decisions. It would fail quietly, and look like the
// moderation feature simply didn't work.
const isModerator = async (actor) => {
  if (!actor) return false;
  if (Array.isArray(actor.permissions)) {
    return actor.permissions.includes('moderate_comments'); // already resolved by middleware
  }
  if (!actor.roleId) return false;

  const role = await db.Role.findByPk(actor.roleId, {
    include: [{ model: db.Permission, as: 'permissions', attributes: ['key'] }],
  });
  if (!role) return false;

  return (role.permissions || []).some((p) => p.key === 'moderate_comments');
};

// What a comment looks like to a regular user.
//
// A hidden comment is TOMBSTONED, not omitted. If we dropped it from the list,
// every reply beneath it would become an orphan — a conversation full of answers
// to a question nobody can see. The body is replaced; the row's position in the
// thread survives.
const commentRow = (c, { asModerator = false } = {}) => {
  const hidden = c.status === 'hidden';
  const deleted = c.deleted_at !== null && c.deleted_at !== undefined;

  const base = {
    id: c.id,
    songId: c.song_id,
    parentCommentId: c.parent_comment_id ?? null,
    createdAt: c.created_at,
    // publicProfile is the whole reason this file can exist safely. Handing the
    // raw User row to the frontend would ship the author's email, phone, and
    // home address to every stranger who opens the song page.
    author: publicProfile(c.author),
    isHidden: hidden,
    isDeleted: deleted,
  };

  if (deleted) {
    return { ...base, body: '[deleted]', author: null };
  }

  if (hidden) {
    return {
      ...base,
      // Moderators see through the tombstone — they must, or they could never
      // review or reverse their own decisions.
      body: asModerator ? c.body : '[removed by moderator]',
      ...(asModerator
        ? { hiddenBy: c.hiddenBy ? publicProfile(c.hiddenBy) : null }
        : {}),
    };
  }

  return { ...base, body: c.body };
};

// ── Reads ────────────────────────────────────────────────────────────────────

// Two-level threading: top-level comments, each with its replies.
//
// Deliberately NOT arbitrary-depth. Infinite nesting is a recursive query and a
// UI nobody can render past level 3. The schema allows parent_comment_id to
// point anywhere, so the DEPTH RULE IS ENFORCED HERE — see createComment.
const listForSong = async ({ actor, songId, page, limit }) => {
  const sid = toId(songId, 'song');

  const song = await db.Song.findByPk(sid);
  if (!song) throw new ApiError(404, 'Song not found');
  if (song.status !== 'published') {
    throw new ApiError(403, 'This song is not available');
  }

  const mod = await isModerator(actor);
  const { safeLimit, safePage, offset } = paginate({ page, limit });

  // Page over TOP-LEVEL comments only. Paginating over a flat list would split
  // a thread across two pages — replies stranded on page 2, their parent on
  // page 1.
  const { count, rows } = await db.Comment.findAndCountAll({
    where: { song_id: sid, parent_comment_id: null, deleted_at: null },
    include: [authorInclude, ...(mod ? [{ model: db.User, as: 'hiddenBy', attributes: ['id', 'username', 'display_name', 'avatar_url', 'deleted_at'] }] : [])],
    order: [['created_at', 'DESC']],
    limit: safeLimit,
    offset,
    distinct: true,
  });

  // Fetch ALL replies for this page's parents in ONE query. The naive version is
  // an N+1: 20 comments = 21 round trips.
  const parentIds = rows.map((c) => c.id);
  const replies = parentIds.length
    ? await db.Comment.findAll({
        where: {
          parent_comment_id: { [Op.in]: parentIds },
          deleted_at: null,
        },
        include: [authorInclude, ...(mod ? [{ model: db.User, as: 'hiddenBy', attributes: ['id', 'username', 'display_name', 'avatar_url', 'deleted_at'] }] : [])],
        order: [['created_at', 'ASC']], // replies read oldest-first: it's a conversation
      })
    : [];

  const byParent = replies.reduce((acc, r) => {
    (acc[r.parent_comment_id] = acc[r.parent_comment_id] || []).push(
      commentRow(r, { asModerator: mod })
    );
    return acc;
  }, {});

  return {
    items: rows.map((c) => ({
      ...commentRow(c, { asModerator: mod }),
      replies: byParent[c.id] || [],
      replyCount: (byParent[c.id] || []).length,
    })),
    pagination: pageMeta(count, safePage, safeLimit),
  };
};

// ── Writes ───────────────────────────────────────────────────────────────────

const createComment = async ({ actor, songId, body, parentCommentId }) => {
  const sid = toId(songId, 'song');
  const text = cleanBody(body);

  const song = await db.Song.findByPk(sid);
  if (!song) throw new ApiError(404, 'Song not found');
  if (song.status !== 'published') {
    throw new ApiError(403, 'This song is not available');
  }

  let parentId = null;

  if (parentCommentId !== undefined && parentCommentId !== null && parentCommentId !== '') {
    parentId = toId(parentCommentId, 'parent comment');

    const parent = await db.Comment.findOne({
      where: { id: parentId, deleted_at: null },
    });
    if (!parent) throw new ApiError(404, 'Parent comment not found');

    // The parent must be on the SAME song. Without this you could graft a reply
    // from one song's thread onto another's by passing a foreign parent id.
    if (parent.song_id !== sid) {
      throw new ApiError(400, 'Parent comment belongs to a different song');
    }

    // DEPTH CAP — the schema cannot enforce this, so the service must.
    // parent_comment_id is just an INTEGER FK; nothing at the DB level stops a
    // reply-to-a-reply-to-a-reply. Two levels is the rule, and this is the only
    // place it exists.
    if (parent.parent_comment_id !== null) {
      throw new ApiError(400, 'Replies are only allowed one level deep');
    }

    // You cannot reply to a comment a moderator has removed. Allowing it would
    // let a thread grow under content that has been ruled out of bounds.
    if (parent.status === 'hidden') {
      throw new ApiError(403, 'You cannot reply to a removed comment');
    }
  }

  const comment = await db.Comment.create({
    user_id: actor.id,
    song_id: sid,
    body: text,
    parent_comment_id: parentId,
    status: 'visible',
  });

  const withAuthor = await db.Comment.findByPk(comment.id, { include: [authorInclude] });
  return commentRow(withAuthor);
};

// The AUTHOR withdrawing their own comment.
const deleteComment = async ({ actor, commentId }) => {
  const id = toId(commentId, 'comment');

  const comment = await db.Comment.findOne({ where: { id, deleted_at: null } });
  if (!comment) throw new ApiError(404, 'Comment not found');

  // Moderators may also delete — but note this is a DIFFERENT act from hiding.
  // Deleting removes it entirely; hiding preserves it with an audit trail.
  // A moderator wanting a reversible, attributable action should hide, not delete.
  const mine = comment.user_id === actor.id;
  if (!mine && !(await isModerator(actor))) {
    throw new ApiError(403, 'You can only delete your own comments');
  }

  // Soft delete. The row survives because REPLIES DEPEND ON IT — a hard delete
  // would either cascade away a whole conversation or leave orphaned children
  // pointing at a row that no longer exists. The tombstone keeps the thread's
  // shape intact while removing the content.
  comment.deleted_at = new Date();
  await comment.save();

  return { id: comment.id, deleted: true };
};

// ── Moderation ───────────────────────────────────────────────────────────────
// This is what MODERATE_COMMENTS finally buys.

const setCommentStatus = async ({ actor, commentId, status }) => {
  const id = toId(commentId, 'comment');

  if (!['visible', 'hidden'].includes(status)) {
    throw new ApiError(400, "status must be 'visible' or 'hidden'");
  }

  const comment = await db.Comment.findOne({ where: { id, deleted_at: null } });
  if (!comment) throw new ApiError(404, 'Comment not found');

  comment.status = status;

  // The audit trail. hidden_by_user_id answers "WHO decided this?" — the
  // question that makes moderation accountable rather than arbitrary. It is
  // cleared on unhide, because an un-hidden comment has no hider.
  comment.hidden_by_user_id = status === 'hidden' ? actor.id : null;

  await comment.save();

  return {
    id: comment.id,
    status: comment.status,
    hiddenByUserId: comment.hidden_by_user_id,
  };
};

// The moderation queue: every hidden comment, newest first, with the moderator
// who hid it. This is the review surface — moderation without a way to review
// past decisions is just deletion with extra steps.
const listHidden = async ({ page, limit }) => {
  const { safeLimit, safePage, offset } = paginate({ page, limit });

  const { count, rows } = await db.Comment.findAndCountAll({
    where: { status: 'hidden', deleted_at: null },
    include: [
      authorInclude,
      {
        model: db.User,
        as: 'hiddenBy',
        attributes: ['id', 'username', 'display_name', 'avatar_url', 'deleted_at'],
      },
      { model: db.Song, as: 'song', attributes: ['id', 'title'] },
    ],
    order: [['updated_at', 'DESC']],
    limit: safeLimit,
    offset,
    distinct: true,
  });

  return {
    items: rows.map((c) => ({
      id: c.id,
      body: c.body, // moderators see the real body — they must, to review it
      createdAt: c.created_at,
      author: publicProfile(c.author),
      hiddenBy: c.hiddenBy ? publicProfile(c.hiddenBy) : null,
      song: c.song ? { id: c.song.id, title: c.song.title } : null,
    })),
    pagination: pageMeta(count, safePage, safeLimit),
  };
};

module.exports = {
  listForSong,
  createComment,
  deleteComment,
  setCommentStatus,
  listHidden,
};