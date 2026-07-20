'use strict';
const db = require('../models');
const { Op, fn, col, literal } = db.Sequelize;
const ApiError = require('../utils/ApiError');
const { hashPassword, generateTempPassword } = require('../utils/password');
const { sendTempPasswordEmail } = require('./emailService');
const { cascadeUserSoftDelete } = require('./userCascade');
const MAX_ASSIGNABLE_LEVEL = 4; // Admin
const CREATABLE_ROLES = ['Admin']; 
const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

const LOCKED_ROLE = 'Super Admin';

const MAX_EDITABLE_ROLE_LEVEL = 4; // Admin and below

const ADMIN_LEVEL = 4;      // Admin
const MODERATOR_LEVEL = 3;  // highest level shown on the Manage Users page

const adminUserRow = (user) => ({
  id: user.id,
  username: user.username,
  email: user.email,
  displayName: user.display_name,
  phoneNumber: user.phone_number ?? null,
  role: user.role ? user.role.name : null,
  roleLevel: user.role ? user.role.level : null,
  isActive: user.is_active,
  gender: user.gender ?? null,
  birthday: user.birthday ?? null,
  addressStreet: user.address_street ?? null,
  emailVerifiedAt: user.email_verified_at ?? null,
  lastLoginAt: user.last_login_at ?? null,
  createdAt: user.created_at,
});

const paginatedUserList = async ({ page, limit, roleWhere, search }) => {
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
  const safePage = Math.max(parseInt(page, 10) || 1, 1);
  const offset = (safePage - 1) * safeLimit;

  // Base filter: never show soft-deleted rows.
  const userWhere = { deleted_at: null };

  // Optional free-text search: case-insensitive partial match across the three
  // human-facing identifiers. MySQL's default collation is case-insensitive, so
  // Op.like already matches regardless of case — no LOWER() needed.
  const term = String(search || '').trim();
  if (term) {
    const like = { [Op.like]: `%${term}%` };
    userWhere[Op.or] = [
      { username: like },
      { email: like },
      { display_name: like },
    ];
  }

  const { count, rows } = await db.User.findAndCountAll({
    where: userWhere,
    include: [{ model: db.Role, as: 'role', where: roleWhere, required: true }],
    order: [['id', 'ASC']],
    limit: safeLimit,
    offset,
    distinct: true,
  });

  return {
    users: rows.map(adminUserRow),
    pagination: {
      page: safePage,
      limit: safeLimit,
      total: count,
      totalPages: Math.ceil(count / safeLimit),
    },
  };
};

const listUsers = async ({ page = 1, limit = 50, viewerLevel, search } = {}) => {
  const level = Number(viewerLevel) || 0;

  const ceiling = Math.min(MODERATOR_LEVEL, level - 1);

  const roleWhere = { level: { [Op.lte]: ceiling } };

  return paginatedUserList({ page, limit, roleWhere, search });
};

const listAdmins = async ({ page = 1, limit = 50, search } = {}) => {
  const roleWhere = { level: ADMIN_LEVEL };
  return paginatedUserList({ page, limit, roleWhere, search });
};

const findByUsername = async ({ username }) => {
  const handle = String(username || '').trim().toLowerCase();
  if (!handle) throw new ApiError(400, 'username is required');

  const user = await db.User.findOne({
    where: { username: handle },
    include: [{ model: db.Role, as: 'role' }],
  });
  if (!user) throw new ApiError(404, 'No user found with that username');

  return adminUserRow(user);
};

const changeUserRole = async ({ actor, targetUserId, newRoleName }) => {
  // Guardrail 1: no changing your own role.
  if (Number(actor.id) === Number(targetUserId)) {
    throw new ApiError(403, 'You cannot change your own role');
  }

  const newRole = await db.Role.findOne({ where: { name: newRoleName } });
  if (!newRole) throw new ApiError(400, 'Unknown role');

  // Guardrail 2: cap what can be assigned at Admin and below.
  if (newRole.level > MAX_ASSIGNABLE_LEVEL) {
    throw new ApiError(403, 'That role cannot be assigned through this dashboard');
  }

  const target = await db.User.findByPk(targetUserId, {
    include: [{ model: db.Role, as: 'role' }],
  });
  if (!target) throw new ApiError(404, 'Target user not found');

  if (!(actor.level > target.role.level)) {
    throw new ApiError(403, 'You cannot modify a user at or above your own level');
  }
  if (!(actor.level > newRole.level)) {
    throw new ApiError(403, 'You cannot assign a role at or above your own level');
  }

  // No-op guard: nothing to do if they're already that role.
  if (target.role_id === newRole.id) {
    throw new ApiError(400, 'User already has that role');
  }

  target.role_id = newRole.id;
  await target.save();

  // Re-load with the new role for an accurate response row.
  const updated = await db.User.findByPk(target.id, {
    include: [{ model: db.Role, as: 'role' }],
  });
  return adminUserRow(updated);
};
  
const createUser = async ({ actor, email, displayName, username, role = 'Admin' }) => {
  const cleanEmail = String(email || '').trim();
  const cleanName = String(displayName || '').trim();
  const cleanUsername = String(username || '').trim().toLowerCase();

  if (!cleanEmail) throw new ApiError(400, 'email is required');
  if (!cleanName) throw new ApiError(400, 'displayName is required');

  if (!CREATABLE_ROLES.includes(role)) {
    throw new ApiError(403, 'That role cannot be created through this dashboard');
  }
  if (!USERNAME_RE.test(cleanUsername)) {
    throw new ApiError(
      400,
      'username must be 3-20 characters: lowercase letters, numbers, or underscores'
    );
  }

  // Friendly pre-checks; the DB unique indexes are the real guarantee.
  const emailTaken = await db.User.findOne({ where: { email: cleanEmail } });
  if (emailTaken) throw new ApiError(409, 'Email already registered');

  const usernameTaken = await db.User.findOne({ where: { username: cleanUsername } });
  if (usernameTaken) throw new ApiError(409, 'Username already taken');

  const roleRow = await db.Role.findOne({ where: { name: role } });
  if (!roleRow) throw new ApiError(500, 'Role not configured');

  const tempPassword = generateTempPassword();
  const password_hash = await hashPassword(tempPassword);

  const created = await db.User.create({
    email: cleanEmail,
    password_hash,
    display_name: cleanName,
    username: cleanUsername,
    role_id: roleRow.id,
    must_change_password: true,     // forced change on first login
    email_verified_at: new Date(),  // Super Admin vouches for the address
  });

  const emailDelivery = await sendTempPasswordEmail({
    to: created.email,
    tempPassword,
    displayName: created.display_name,
  });

  return {
    user: {
      id: created.id,
      email: created.email,
      username: created.username,
      displayName: created.display_name,
      role: roleRow.name,
      mustChangePassword: created.must_change_password,
    },
    tempPassword,   // returned ONCE so the Super Admin sees it on screen too
    emailDelivery,
  };
};


const setUserStatus = async ({ actor, targetUserId, isActive }) => {
  if (Number(actor.id) === Number(targetUserId)) {
    throw new ApiError(403, 'You cannot change your own status');
  }

  const target = await db.User.findByPk(targetUserId, {
    include: [{ model: db.Role, as: 'role' }],
  });
  if (!target) throw new ApiError(404, 'Target user not found');

  // Strict-higher rule — mirrors changeUserRole.
  if (!(actor.level > target.role.level)) {
    throw new ApiError(403, 'You cannot modify a user at or above your own level');
  }

  target.is_active = isActive;
  await target.save();

  return adminUserRow(target);
};

const softDeleteUser = async ({ actor, targetUserId }) => {
  if (Number(actor.id) === Number(targetUserId)) {
    throw new ApiError(403, 'You cannot delete your own account from here');
  }

  const target = await db.User.findByPk(targetUserId, {
    include: [{ model: db.Role, as: 'role' }],
  });
  if (!target) throw new ApiError(404, 'Target user not found');

  // Strict-higher rule — identical to setUserStatus / changeUserRole.
  if (!(actor.level > target.role.level)) {
    throw new ApiError(403, 'You cannot modify a user at or above your own level');
  }

  // Idempotent: a second delete on an already-removed row is a no-op success.
  if (target.deleted_at !== null) {
    return { id: target.id, deleted: true };
  }

   await db.sequelize.transaction(async (t) => {
    await cascadeUserSoftDelete(target.id, t);
    target.deleted_at = new Date();
    await target.save({ transaction: t });
  });

  return { id: target.id, deleted: true };
};

const getAllPermissions = async () => {
  const perms = await db.Permission.findAll({ order: [['id', 'ASC']] });
  return perms.map((p) => ({ id: p.id, key: p.key, description: p.description }));
};

const getRolesWithPermissions = async () => {
  const roles = await db.Role.findAll({
    include: [{ model: db.Permission, as: 'permissions', attributes: ['id', 'key'] }],
    order: [['level', 'DESC']],
  });

  return roles.map((role) => ({
    id: role.id,
    name: role.name,
    level: role.level,
    editable: role.name !== LOCKED_ROLE && role.level <= MAX_EDITABLE_ROLE_LEVEL,
    permissions: (role.permissions || []).map((p) => p.key),
  }));
};

const resolveEditableTarget = async ({ roleId, permissionKey }) => {
  const role = await db.Role.findByPk(roleId);
  if (!role) throw new ApiError(404, 'Role not found');

  if (role.name === LOCKED_ROLE) {
    throw new ApiError(403, `${LOCKED_ROLE} permissions cannot be modified`);
  }
  if (role.level > MAX_EDITABLE_ROLE_LEVEL) {
    throw new ApiError(403, 'That role cannot be edited through this dashboard');
  }

  const permission = await db.Permission.findOne({ where: { key: permissionKey } });
  if (!permission) throw new ApiError(404, 'Unknown permission');

  return { role, permission };
};

const grantPermission = async ({ roleId, permissionKey }) => {
  const { role, permission } = await resolveEditableTarget({ roleId, permissionKey });

  const existing = await db.RolePermission.findOne({
    where: { role_id: role.id, permission_id: permission.id },
  });
  if (existing) throw new ApiError(400, 'Role already has that permission');

  await db.RolePermission.create({ role_id: role.id, permission_id: permission.id });

  return rolePermissionSnapshot(role.id);
};

const revokePermission = async ({ roleId, permissionKey }) => {
  const { role, permission } = await resolveEditableTarget({ roleId, permissionKey });

  const deleted = await db.RolePermission.destroy({
    where: { role_id: role.id, permission_id: permission.id },
  });
  if (!deleted) throw new ApiError(400, 'Role does not have that permission');

  return rolePermissionSnapshot(role.id);
};

const rolePermissionSnapshot = async (roleId) => {
  const role = await db.Role.findByPk(roleId, {
    include: [{ model: db.Permission, as: 'permissions', attributes: ['key'] }],
  });
  return {
    id: role.id,
    name: role.name,
    level: role.level,
    permissions: (role.permissions || []).map((p) => p.key),
  };
};

const CONTACT_STATUSES = ['new', 'read', 'resolved'];

const contactMessageRow = (m) => ({
  id: m.id,
  name: m.name,
  email: m.email,
  subject: m.subject ?? null,
  message: m.message,
  status: m.status,
  userId: m.user_id ?? null,
  createdAt: m.createdAt ?? null,

  // Audit trail. handler is eager-loaded; null when nobody has resolved it.
  handledAt: m.handled_at ?? null,
  handledBy: m.handler
    ? {
        id: m.handler.id,
        username: m.handler.username,
        displayName: m.handler.display_name,
      }
    : null,
});

// Eager-load the resolving admin on every contact read, so the list and the
// single-row response share one shape.
const CONTACT_INCLUDE = [
  {
    model: db.User,
    as: 'handler',
    attributes: ['id', 'username', 'display_name'],
    required: false, // LEFT JOIN — unresolved messages must still come back
  },
];

const listContactMessages = async ({ page = 1, limit = 50, status, search } = {}) => {
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
  const safePage = Math.max(parseInt(page, 10) || 1, 1);
  const offset = (safePage - 1) * safeLimit;

  const where = {};

  if (status && CONTACT_STATUSES.includes(status)) {
    where.status = status;
  }

  const clean = String(search || '').trim();
  if (clean) {
    const term = `%${clean.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    where[Op.or] = [
      { name:    { [Op.like]: term } },
      { email:   { [Op.like]: term } },
      { subject: { [Op.like]: term } },
    ];
  }

  const { count, rows } = await db.ContactMessage.findAndCountAll({
    where,
    include: CONTACT_INCLUDE,
    order: [['created_at', 'DESC']],
    limit: safeLimit,
    offset,
  });

  return {
    messages: rows.map(contactMessageRow),
    pagination: {
      page: safePage,
      limit: safeLimit,
      total: count,
      totalPages: Math.ceil(count / safeLimit),
    },
  };
};

const setContactStatus = async ({ actor, messageId, status }) => {
  if (!CONTACT_STATUSES.includes(status)) {
    throw new ApiError(400, `status must be one of: ${CONTACT_STATUSES.join(', ')}`);
  }

  const message = await db.ContactMessage.findByPk(messageId);
  if (!message) throw new ApiError(404, 'Contact message not found');

  const isResolving = status === 'resolved';

  await message.update({
    status,
    handled_by: isResolving ? actor.id : null,
    handled_at: isResolving ? new Date() : null,
  });

  const fresh = await db.ContactMessage.findByPk(message.id, { include: CONTACT_INCLUDE });
  return contactMessageRow(fresh);
};

const getMetrics = async ({ actorLevel }) => {
  const SUPER_ADMIN_LEVEL = 5;
  const canSeeSuperAdmin = Number(actorLevel) >= SUPER_ADMIN_LEVEL;

  const roles = await db.Role.findAll({
    attributes: ['id', 'name', 'level'],
    include: [
      {
        model: db.User,
        as: 'users',
        attributes: ['id', 'is_active'],
        where: { deleted_at: null },
        required: false,
      },
    ],
    order: [['level', 'DESC']],
  });

  let totalUsers = 0;
  let activeUsers = 0;
  let inactiveUsers = 0;

  const byRole = [];

  for (const role of roles) {
    const users = role.users || [];
    const active = users.filter((u) => u.is_active).length;
    const inactive = users.length - active;

    totalUsers += users.length;
    activeUsers += active;
    inactiveUsers += inactive;

    if (role.name === 'Super Admin' && !canSeeSuperAdmin) continue;

    byRole.push({
      role: role.name,
      level: role.level,
      active,
      inactive,
      total: users.length,
    });
  }

  const [
    totalSongs, publishedSongs, draftSongs, archivedSongs,
    totalAlbums, publishedAlbums, archivedAlbums,
    totalArtists, verifiedArtists,
    newQueries, totalPlaysRow,
  ] = await Promise.all([
    db.Song.count(),
    db.Song.count({ where: { status: 'published' } }),
    db.Song.count({ where: { status: 'draft' } }),
    db.Song.count({ where: { status: 'archived' } }),
    db.Album.count(),
    db.Album.count({ where: { status: 'published' } }),
    db.Album.count({ where: { status: 'archived' } }),
    db.ArtistProfile.count({
      include: [{
        model: db.User,
        as: 'user',
        attributes: [],
        where: { deleted_at: null },
        required: true,
      }],
    }),
    db.ArtistProfile.count({
      where: { is_verified: true },
      include: [{
        model: db.User,
        as: 'user',
        attributes: [],
        where: { deleted_at: null },
        required: true,
      }],
    }),

    db.ContactMessage.count({ where: { status: { [Op.ne]: 'resolved' } } }),

    db.Song.findOne({
      attributes: [[fn('SUM', col('play_count')), 'total']],
      raw: true,
    }),
  ]);

  const genreRows = await db.Genre.findAll({
    attributes: [
      'id',
      'name',
      [fn('COALESCE', fn('SUM', col('songs.play_count')), 0), 'plays'],
      [fn('COUNT', col('songs.id')), 'song_count'],
    ],
    include: [{
      model: db.Song,
      as: 'songs',
      attributes: [],
      through: { attributes: [] },
      where: { status: 'published' },
      required: false,
    }],
    group: ['Genre.id', 'Genre.name'],
    order: [[literal('plays'), 'DESC'], ['name', 'ASC']],
    subQuery: false,
    raw: true,
  });

  const playsByGenre = genreRows.map((r) => ({
    id: Number(r.id),
    name: r.name,
    plays: Number(r.plays || 0),
    songCount: Number(r.song_count || 0),
  }));

  const topTrackRows = await db.Song.findAll({
    where: { status: 'published' },
    attributes: ['id', 'title', 'play_count', 'album_id'],
    include: [{
      model: db.ArtistProfile,
      as: 'artistProfile',
      attributes: ['id', 'stage_name'],
      required: true,
    }],
    order: [['play_count', 'DESC'], ['id', 'ASC']],
    limit: 5,
  });

  const topTracks = topTrackRows.map((s) => ({
    id: s.id,
    title: s.title,
    plays: Number(s.play_count || 0),
    albumId: s.album_id != null ? Number(s.album_id) : null,
    artist: s.artistProfile
      ? { id: s.artistProfile.id, stageName: s.artistProfile.stage_name }
      : null,
  }));

  const topArtistRows = await db.ArtistProfile.findAll({
    attributes: [
      'id',
      'stage_name',
      [fn('COALESCE', fn('SUM', col('songs.play_count')), 0), 'plays'],
    ],
    include: [
      {
        model: db.User,
        as: 'user',
        attributes: [],
        where: { deleted_at: null },
        required: true,
      },
      {
        model: db.Song,
        as: 'songs',
        attributes: [],
        where: { status: 'published' },
        required: false,
      },
    ],
    group: ['ArtistProfile.id', 'ArtistProfile.stage_name'],
    order: [[literal('plays'), 'DESC'], ['stage_name', 'ASC']],
    limit: 5,
    subQuery: false,
    raw: true,
  });

  const topArtists = topArtistRows.map((r) => ({
    id: Number(r.id),
    stageName: r.stage_name,
    plays: Number(r.plays || 0),
  }));
  const PLAYS_WINDOW_DAYS = 14;
  const windowStart = new Date();
  windowStart.setHours(0, 0, 0, 0);
  windowStart.setDate(windowStart.getDate() - (PLAYS_WINDOW_DAYS - 1));

  const dailyRows = await db.PlayHistory.findAll({
    attributes: [
      [fn('DATE', col('played_at')), 'day'],
      [fn('COUNT', col('id')), 'plays'],
    ],
    where: {
      is_self_play: false,
      played_at: { [Op.gte]: windowStart },
    },
    group: [fn('DATE', col('played_at'))],
    order: [[literal('day'), 'ASC']],
    raw: true,
  });

  const playsByDay = new Map();
  for (const r of dailyRows) {
    const key = String(r.day).slice(0, 10);
    playsByDay.set(key, Number(r.plays || 0));
  }

  const playsOverTime = [];
  for (let i = 0; i < PLAYS_WINDOW_DAYS; i += 1) {
    const d = new Date(windowStart);
    d.setDate(windowStart.getDate() + i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    playsOverTime.push({ date: key, plays: playsByDay.get(key) ?? 0 });
  }
  const totalPlays = Number(totalPlaysRow?.total || 0);

  return {
    totalUsers,
    activeUsers,
    inactiveUsers,
    canSeeSuperAdmin,
    byRole,
    catalog: {
      totalSongs,
      publishedSongs,
      draftSongs,
      archivedSongs,
      totalAlbums,
      publishedAlbums,
      archivedAlbums,
      totalArtists,
      verifiedArtists,
      pendingArtists: totalArtists - verifiedArtists,
      totalPlays,
      playsByGenre,
      topTracks,
      topArtists,
      playsOverTime,
    },
    inbox: {
      newQueries,
    },
  };
};

module.exports = {
  listUsers,
  listAdmins,
  findByUsername,
  changeUserRole,
  createUser,
  setUserStatus,
  softDeleteUser,
  getAllPermissions,
  getRolesWithPermissions,
  grantPermission,
  revokePermission,
  getMetrics,
  listContactMessages,
  setContactStatus,
};