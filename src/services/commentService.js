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

const authorInclude = {
  model: db.User,
  as: 'author',
  attributes: ['id', 'username', 'display_name', 'avatar_url', 'deleted_at'],
};
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

const hasPermission = (actor, key) =>
  Array.isArray(actor?.permissions) && actor.permissions.includes(key);

const isGlobalCommentDeleter = async (actor) => {
  if (hasPermission(actor, 'manage_users')) return true;
  if (!actor?.roleId) return false;
  const role = await db.Role.findByPk(actor.roleId, {
    include: [{ model: db.Permission, as: 'permissions', attributes: ['key'] }],
  });
  return (role?.permissions || []).some((p) => p.key === 'manage_users');
};

const ownsCommentSong = async (actor, comment) => {
  const profile = await db.ArtistProfile.findOne({ where: { user_id: actor.id } });
  if (!profile) return false;
  const song = await db.Song.findByPk(comment.song_id, { attributes: ['artist_profile_id'] });
  return Boolean(song) && song.artist_profile_id === profile.id;
};

const commentRow = (c, { asModerator = false } = {}) => {
  const hidden = c.status === 'hidden';
  const deleted = c.deleted_at !== null && c.deleted_at !== undefined;

  const base = {
    id: c.id,
    songId: c.song_id,
    parentCommentId: c.parent_comment_id ?? null,
    replyToCommentId: c.reply_to_comment_id ?? null,
    createdAt: c.created_at,
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
      body: asModerator ? c.body : '[removed by moderator]',
      ...(asModerator
        ? { hiddenBy: c.hiddenBy ? publicProfile(c.hiddenBy) : null }
        : {}),
    };
  }

  return { ...base, body: c.body };
};

const listForSong = async ({ actor, songId, page, limit }) => {
  const sid = toId(songId, 'song');

  const song = await db.Song.findByPk(sid);
  if (!song) throw new ApiError(404, 'Song not found');
  if (song.status !== 'published') {
    throw new ApiError(403, 'This song is not available');
  }

  const mod = await isModerator(actor);
  const { safeLimit, safePage, offset } = paginate({ page, limit });

  const { count, rows } = await db.Comment.findAndCountAll({
    where: { song_id: sid, parent_comment_id: null, deleted_at: null },
    include: [authorInclude, ...(mod ? [{ model: db.User, as: 'hiddenBy', attributes: ['id', 'username', 'display_name', 'avatar_url', 'deleted_at'] }] : [])],
    order: [['created_at', 'DESC']],
    limit: safeLimit,
    offset,
    distinct: true,
  });

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
    (acc[r.parent_comment_id] = acc[r.parent_comment_id] || []).push(r);
    return acc;
  }, {});

  const authorById = {};
  for (const r of rows) authorById[r.id] = publicProfile(r.author);
  for (const r of replies) authorById[r.id] = publicProfile(r.author);

  const replyRow = (r) => {
    const row = commentRow(r, { asModerator: mod });
    if (r.reply_to_comment_id != null && r.reply_to_comment_id !== r.parent_comment_id) {
      row.replyingTo = {
        commentId: r.reply_to_comment_id,
        author: authorById[r.reply_to_comment_id] ?? null,
      };
    }
    return row;
  };

  return {
    items: rows.map((c) => ({
      ...commentRow(c, { asModerator: mod }),
      replies: (byParent[c.id] || []).map(replyRow),
      replyCount: (byParent[c.id] || []).length,
    })),
    pagination: pageMeta(count, safePage, safeLimit),
  };
};


const createComment = async ({ actor, songId, body, parentCommentId }) => {
  const sid = toId(songId, 'song');
  const text = cleanBody(body);

  const song = await db.Song.findByPk(sid);
  if (!song) throw new ApiError(404, 'Song not found');
  if (song.status !== 'published') {
    throw new ApiError(403, 'This song is not available');
  }

  let parentId = null;
  let replyToId = null;

  if (parentCommentId !== undefined && parentCommentId !== null && parentCommentId !== '') {
    const targetId = toId(parentCommentId, 'parent comment');

    const target = await db.Comment.findOne({
      where: { id: targetId, deleted_at: null },
    });
    if (!target) throw new ApiError(404, 'Parent comment not found');


    if (target.song_id !== sid) {
      throw new ApiError(400, 'Parent comment belongs to a different song');
    }

    if (target.status === 'hidden') {
      throw new ApiError(403, 'You cannot reply to a removed comment');
    }

    if (target.parent_comment_id === null) {
      parentId = target.id;
      replyToId = target.id;
    } else if (target.reply_to_comment_id === target.parent_comment_id) {
      parentId = target.parent_comment_id;
      replyToId = target.id;
    } else {
      throw new ApiError(400, 'Replies are only allowed two levels deep');
    }
  }

  const comment = await db.Comment.create({
    user_id: actor.id,
    song_id: sid,
    body: text,
    parent_comment_id: parentId,
    reply_to_comment_id: replyToId,
    status: 'visible',
  });

  const withAuthor = await db.Comment.findByPk(comment.id, { include: [authorInclude] });
  return commentRow(withAuthor);
};

const deleteComment = async ({ actor, commentId }) => {
  const id = toId(commentId, 'comment');

  const comment = await db.Comment.findOne({ where: { id, deleted_at: null } });
  if (!comment) throw new ApiError(404, 'Comment not found');

  const mine = comment.user_id === actor.id;

  let allowed = mine;
  if (!allowed && (await isModerator(actor))) allowed = true; // global moderators
  if (!allowed && hasPermission(actor, 'delete_comments')) {
    if (await isGlobalCommentDeleter(actor)) {
      allowed = true; // admin-tier: any comment anywhere
    } else if (await ownsCommentSong(actor, comment)) {
      allowed = true; // artist-tier: only comments on their own songs
    }
  }

  if (!allowed) {
    throw new ApiError(403, 'You are not allowed to delete this comment');
  }

  comment.deleted_at = new Date();
  await comment.save();

  return { id: comment.id, deleted: true };
};


const setCommentStatus = async ({ actor, commentId, status }) => {
  const id = toId(commentId, 'comment');

  if (!['visible', 'hidden'].includes(status)) {
    throw new ApiError(400, "status must be 'visible' or 'hidden'");
  }

  const comment = await db.Comment.findOne({ where: { id, deleted_at: null } });
  if (!comment) throw new ApiError(404, 'Comment not found');

  comment.status = status;
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

const getMyComments = async ({ actor, page = 1, limit = 30 }) => {
  const p = Math.max(Number(page) || 1, 1);
  const lim = Math.min(Math.max(Number(limit) || 30, 1), 100);

  const { rows, count } = await db.Comment.findAndCountAll({
    where: { user_id: actor.id, deleted_at: null },
    include: [{ model: db.Song, as: 'song', attributes: ['id', 'title', 'album_id'] }],
    order: [['created_at', 'DESC']],
    limit: lim,
    offset: (p - 1) * lim,
  });

  const items = rows.map((c) => ({
    id: c.id,
    songId: c.song_id,
    body: c.status === 'hidden' ? '[removed by moderator]' : c.body,
    isHidden: c.status === 'hidden',
    createdAt: c.created_at,
    song: c.song ? { id: c.song.id, title: c.song.title, albumId: c.song.album_id } : null,
  }));

  return { items, total: count, page: p, limit: lim };
};

module.exports = {
  listForSong,
  createComment,
  deleteComment,
  setCommentStatus,
  listHidden,
  getMyComments,
};