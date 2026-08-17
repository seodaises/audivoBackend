'use strict';
const db = require('../models');
const ApiError = require('../utils/ApiError');
const { publicProfile } = require('../serializers/publicProfile');
const { Op } = db.Sequelize;
const ACTOR_ATTRS = ['id', 'username', 'display_name', 'avatar_url', 'deleted_at'];

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

// ── WRITE side (called by hooks in other services) 
const notSelf = (recipientId, actorId) =>
  Number(recipientId) && Number(recipientId) !== Number(actorId);
const fanOutToFollowers = async ({ artistProfileId, albumId, type, transaction = null } = {}) => {
  try {
    const followers = await db.Follow.findAll({
      where: { artist_profile_id: artistProfileId },
      attributes: ['follower_user_id'],
      ...(transaction ? { transaction } : {}),
    });
    if (!followers.length) return { created: 0 };

    const rows = followers.map((f) => ({
      recipient_user_id: f.follower_user_id,
      actor_user_id: null, // the "actor" is the artist act, carried via album_id
      type,
      album_id: albumId,
    }));

    await db.Notification.bulkCreate(rows, transaction ? { transaction } : {});
    return { created: rows.length };
  } catch (err) {
    console.error(`[notifications] ${type} fan-out failed:`, err.message);
    return { created: 0 };
  }
};

const emitRelease = async ({ artistProfileId, albumId, transaction = null } = {}) =>
  fanOutToFollowers({ artistProfileId, albumId, type: 'release', transaction });

const emitUpcomingRelease = async ({ artistProfileId, albumId, transaction = null } = {}) =>
  fanOutToFollowers({ artistProfileId, albumId, type: 'upcoming_release', transaction });

// Someone commented on a song. Recipient = the song's owning artist's user.
const emitComment = async ({ songId, commentId, actorUserId } = {}) => {
  try {
    const song = await db.Song.findByPk(songId, {
      attributes: ['id', 'artist_profile_id', 'album_id'],
    });
    if (!song) return { created: 0 };

    const profile = await db.ArtistProfile.findByPk(song.artist_profile_id, {
      attributes: ['id', 'user_id'],
    });
    if (!profile || !notSelf(profile.user_id, actorUserId)) return { created: 0 };

    await db.Notification.create({
      recipient_user_id: profile.user_id,
      actor_user_id: actorUserId,
      type: 'comment',
      song_id: songId,
      album_id: song.album_id ?? null,
      comment_id: commentId,
    });
    return { created: 1 };
  } catch (err) {
    console.error('[notifications] emitComment failed:', err.message);
    return { created: 0 };
  }
};

// Someone replied to a comment. Recipient = the author of the comment replied to.
const emitCommentReply = async ({ parentCommentId, replyId, songId, actorUserId } = {}) => {
  try {
    const parent = await db.Comment.findByPk(parentCommentId, {
      attributes: ['id', 'user_id'],
    });
    if (!parent || !notSelf(parent.user_id, actorUserId)) return { created: 0 };

    // Same deep-link reason as emitComment: resolve the album that owns the song.
    let albumId = null;
    if (songId) {
      const song = await db.Song.findByPk(songId, { attributes: ['id', 'album_id'] });
      albumId = song?.album_id ?? null;
    }

    await db.Notification.create({
      recipient_user_id: parent.user_id,
      actor_user_id: actorUserId,
      type: 'comment_reply',
      song_id: songId ?? null,
      album_id: albumId,
      comment_id: replyId,
    });
    return { created: 1 };
  } catch (err) {
    console.error('[notifications] emitCommentReply failed:', err.message);
    return { created: 0 };
  }
};
// AI lyrics transcription finished for a song. Recipient = the song's
// owning artist's user, same resolution as emitComment. No actor_user_id —
// this is a system event, not caused by another user (mirrors emitRelease/
// emitUpcomingRelease, which are also system-triggered).
const emitLyricsReady = async ({ songId } = {}) => {
  try {
    const song = await db.Song.findByPk(songId, {
      attributes: ['id', 'artist_profile_id', 'album_id'],
    });
    if (!song) return { created: 0 };

    const profile = await db.ArtistProfile.findByPk(song.artist_profile_id, {
      attributes: ['id', 'user_id'],
    });
    if (!profile) return { created: 0 };

    await db.Notification.create({
      recipient_user_id: profile.user_id,
      actor_user_id: null,
      type: 'lyrics_ready',
      song_id: song.id,
      album_id: song.album_id ?? null,
    });
    return { created: 1 };
  } catch (err) {
    console.error('[notifications] emitLyricsReady failed:', err.message);
    return { created: 0 };
  }
};

// ── READ side (the feed API)

const notifRow = (n) => {
  const album = n.album
    ? { id: n.album.id, publicId: n.album.public_id, title: n.album.title }
    : n.song && n.song.album
    ? { id: n.song.album.id, publicId: n.song.album.public_id, title: n.song.album.title }
    : null;

  return {
    id: n.id,
    type: n.type,
    isRead: n.read_at !== null && n.read_at !== undefined,
    createdAt: n.created_at,
    actor: n.actor ? publicProfile(n.actor) : null,
    song: n.song ? { id: n.song.id, title: n.song.title } : null,
    album,
    commentId: n.comment_id ?? null,
  };
};

const listForUser = async ({ actor, page, limit, unreadOnly = false }) => {
  const { safeLimit, safePage, offset } = paginate({ page, limit });

  const where = { recipient_user_id: actor.id };
  if (unreadOnly) where.read_at = { [Op.is]: null };

  const { count, rows } = await db.Notification.findAndCountAll({
    where,
    include: [
      { model: db.User, as: 'actor', attributes: ACTOR_ATTRS },
      {
        model: db.Song,
        as: 'song',
        attributes: ['id', 'title', 'album_id'],
        include: [{ model: db.Album, as: 'album', attributes: ['id', 'public_id', 'title'] }],
      },
      { model: db.Album, as: 'album', attributes: ['id', 'public_id', 'title'] },
    ],
    order: [['created_at', 'DESC']],
    limit: safeLimit,
    offset,
    distinct: true,
  });

  return {
    items: rows.map(notifRow),
    pagination: pageMeta(count, safePage, safeLimit),
  };
};

const unreadCount = async ({ actor }) => {
  const count = await db.Notification.count({
    where: { recipient_user_id: actor.id, read_at: { [Op.is]: null } },
  });
  return { unread: count };
};

const markRead = async ({ actor, notificationId }) => {
  const id = toId(notificationId, 'notification');
  const n = await db.Notification.findOne({
    where: { id, recipient_user_id: actor.id },
  });
  if (!n) throw new ApiError(404, 'Notification not found');

  if (n.read_at === null || n.read_at === undefined) {
    n.read_at = new Date();
    await n.save();
  }
  return { id: n.id, isRead: true };
};

const markAllRead = async ({ actor }) => {
  const [affected] = await db.Notification.update(
    { read_at: new Date() },
    { where: { recipient_user_id: actor.id, read_at: { [Op.is]: null } } }
  );
  return { updated: affected };
};

module.exports = {
  emitRelease,
  emitUpcomingRelease,
  emitComment,
  emitCommentReply,
  emitLyricsReady,
  listForUser,
  unreadCount,
  markRead,
  markAllRead,
};