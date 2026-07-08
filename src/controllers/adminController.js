'use strict';
const adminService = require('../services/adminService');
const catchAsync = require('../utils/catchAsync');
const { success } = require('../utils/response');
const ApiError = require('../utils/ApiError');

const listUsers = catchAsync(async (req, res) => {
  const { page, limit, search } = req.query;
  const result = await adminService.listUsers({
    page,
    limit,
    search,
    viewerLevel: req.user.level,
  });
  return success(res, 200, 'Users retrieved', result);
});

// GET /api/admin/admins?page=&limit=  — Super Admin only (the Manage Admins page)
const listAdmins = catchAsync(async (req, res) => {
  const { page, limit, search } = req.query;
  const result = await adminService.listAdmins({ page, limit, search });
  return success(res, 200, 'Admins retrieved', result);
});

// GET /api/admin/users/search?username=
const searchByUsername = catchAsync(async (req, res) => {
  const { username } = req.query;
  if (!username) throw new ApiError(400, 'username query param is required');

  const result = await adminService.findByUsername({ username });
  return success(res, 200, 'User found', result);
});

// PATCH /api/admin/users/:id/role   body: { role: "Admin" }
const changeUserRole = catchAsync(async (req, res) => {
  const targetUserId = req.params.id;
  const { role } = req.body || {};
  if (!role) throw new ApiError(400, 'role is required');

  const result = await adminService.changeUserRole({
    actor: req.user,          // carries id + level (set by protect + requireMinLevel)
    targetUserId,
    newRoleName: role,
  });
  return success(res, 200, 'User role updated', result);
});

// POST /api/admin/users   body: { email, displayName, username }
const createUser = catchAsync(async (req, res) => {
  const { email, displayName, username } = req.body || {};
  const result = await adminService.createUser({
    actor: req.user,
    email,
    displayName,
    username,
  });
  return success(res, 201, 'Admin account created', result);
});

// PATCH /api/admin/users/:id/status   body: { isActive: boolean }
const setStatus = catchAsync(async (req, res) => {
  const targetUserId = req.params.id;
  const { isActive } = req.body || {};

  // Must be a real boolean — guards against "true" (string) or a missing field.
  if (typeof isActive !== 'boolean') {
    throw new ApiError(400, 'isActive must be true or false');
  }

  const result = await adminService.setUserStatus({
    actor: req.user,
    targetUserId,
    isActive,
  });
  return success(res, 200, isActive ? 'User activated' : 'User deactivated', result);
});

// PATCH /api/admin/users/:id/delete  — soft-delete an account (row survives, account disappears from the tables and can no longer log in). PATCH, not DELETE, to signal this is a state change (deleted_at), not a hard removal.
const deleteUser = catchAsync(async (req, res) => {
  const targetUserId = req.params.id;

  const result = await adminService.softDeleteUser({
    actor: req.user,
    targetUserId,
  });
  return success(res, 200, 'User deleted', result);
});

// GET /api/admin/permissions  — the full permission catalogue (editor columns)
const listPermissions = catchAsync(async (req, res) => {
  const result = await adminService.getAllPermissions();
  return success(res, 200, 'Permissions retrieved', result);
});

// GET /api/admin/roles  — every role with the permissions it grants (editor grid)
const listRolesWithPermissions = catchAsync(async (req, res) => {
  const result = await adminService.getRolesWithPermissions();
  return success(res, 200, 'Roles retrieved', result);
});

// POST /api/admin/roles/:id/permissions/:permKey  — grant one permission
const grantPermission = catchAsync(async (req, res) => {
  const roleId = req.params.id;
  const permissionKey = req.params.permKey;
  const result = await adminService.grantPermission({ roleId, permissionKey });
  return success(res, 200, 'Permission granted', result);
});

// DELETE /api/admin/roles/:id/permissions/:permKey  — revoke one permission
const revokePermission = catchAsync(async (req, res) => {
  const roleId = req.params.id;
  const permissionKey = req.params.permKey;
  const result = await adminService.revokePermission({ roleId, permissionKey });
  return success(res, 200, 'Permission revoked', result);
});

// GET /api/admin/metrics  — user counts per role (Super Admin bucket hidden from Admins). req.user.level is set by requireMinLevel.
const getMetrics = catchAsync(async (req, res) => {
  const result = await adminService.getMetrics({ actorLevel: req.user.level });
  return success(res, 200, 'Metrics retrieved', result);
});

const listContactMessages = catchAsync(async (req, res) => {
  const { page, limit, status } = req.query;
  const result = await adminService.listContactMessages({ page, limit, status });
  return success(res, 200, 'Contact messages retrieved', result);
});

module.exports = {
  listUsers,
  listAdmins,
  searchByUsername,
  changeUserRole,
  createUser,
  setStatus,
  deleteUser,
  listPermissions,
  listRolesWithPermissions,
  grantPermission,
  revokePermission,
  getMetrics,
  listContactMessages,
};