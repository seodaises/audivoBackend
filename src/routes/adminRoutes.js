'use strict';
const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { protect } = require('../middlewares/authMiddleware');
const { requireMinLevel } = require('../middlewares/requireMinLevel');
const { requirePermission } = require('../middlewares/requirePermission');
const validate = require('../middlewares/validate');
const v = require('../validators/adminValidators');

const ADMIN = 4;       // Admin or Super Admin
const SUPER_ADMIN = 5; // Super Admin only

// List every user (the Manage Users table). Moderator-and-below, peer-hidden.
router.get('/users', protect, requireMinLevel(ADMIN), validate(v.listUsers), adminController.listUsers);

// List Admin accounts (the Manage Admins table). Super Admin only.
router.get('/admins', protect, requireMinLevel(SUPER_ADMIN), validate(v.listAdmins), adminController.listAdmins);

// Exact-username lookup (the +Add Admin search bar).
router.get('/users/search', protect, requireMinLevel(ADMIN), validate(v.searchByUsername), adminController.searchByUsername);

router.patch('/users/:id/role', protect, requireMinLevel(SUPER_ADMIN), validate(v.changeUserRole), adminController.changeUserRole);

// Create a new Admin account with a one-time password (emailed + returned once).
router.post('/users', protect, requireMinLevel(SUPER_ADMIN), validate(v.createUser), adminController.createUser);

// Enable/disable an account (the active/inactive toggle).
router.patch('/users/:id/status', protect, requireMinLevel(ADMIN), validate(v.setStatus), adminController.setStatus);

// Soft-delete an account (row survives; hidden everywhere + login blocked).
router.patch('/users/:id/delete', protect, requireMinLevel(ADMIN), validate(v.deleteUser), adminController.deleteUser);

router.get(
  '/metrics',
  protect,
  requireMinLevel(ADMIN),
  requirePermission('view_analytics'),
  adminController.getMetrics
);

// The contact-form queue (admin dashboard).
router.get(
  '/contact-messages',
  protect,
  requireMinLevel(ADMIN),
  requirePermission('manage_users'),
  validate(v.listContactMessages),
  adminController.listContactMessages
);

router.patch(
  '/contact-messages/:id/status',
  protect,
  requireMinLevel(ADMIN),
  requirePermission('manage_users'),
  validate(v.setContactStatus),
  adminController.setContactStatus
);

router.get(
  '/permissions',
  protect,
  requireMinLevel(SUPER_ADMIN),
  requirePermission('manage_roles'),
  adminController.listPermissions
);

router.get(
  '/roles',
  protect,
  requireMinLevel(SUPER_ADMIN),
  requirePermission('manage_roles'),
  adminController.listRolesWithPermissions
);

router.post(
  '/roles/:id/permissions/:permKey',
  protect,
  requireMinLevel(SUPER_ADMIN),
  requirePermission('manage_roles'),
  validate(v.rolePermission),
  adminController.grantPermission
);

router.delete(
  '/roles/:id/permissions/:permKey',
  protect,
  requireMinLevel(SUPER_ADMIN),
  requirePermission('manage_roles'),
  validate(v.rolePermission),
  adminController.revokePermission
);

module.exports = router;
