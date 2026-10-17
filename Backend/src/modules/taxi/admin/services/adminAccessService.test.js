// node --test src/modules/taxi/admin/services/adminAccessService.test.js
import assert from 'node:assert/strict';
import test from 'node:test';
import { hasAdminPermission, normalizeAdminType } from './adminAccessService.js';

test('only known superadmin values give full access', () => {
  assert.equal(normalizeAdminType('superadmin'), 'superadmin');
  assert.equal(normalizeAdminType(' SuperAdmin '), 'superadmin');
  assert.equal(normalizeAdminType('admin'), 'superadmin');
  assert.equal(normalizeAdminType('subadmin'), 'subadmin');
  assert.equal(normalizeAdminType(''), 'subadmin');
  assert.equal(normalizeAdminType(undefined), 'subadmin');
  assert.equal(normalizeAdminType('manager'), 'subadmin');
});

test('an account with no type only gets the permissions it lists', () => {
  assert.equal(hasAdminPermission({}, 'users.view'), false);
  assert.equal(hasAdminPermission({ permissions: ['users.view'] }, 'users.view'), true);
  assert.equal(hasAdminPermission({ permissions: ['users.view'] }, 'wallet.view'), false);
  assert.equal(hasAdminPermission({ role: 'manager', permissions: [] }, 'users.view'), false);
});

test('superadmins keep full access', () => {
  assert.equal(hasAdminPermission({ admin_type: 'superadmin' }, 'wallet.view'), true);
  assert.equal(hasAdminPermission({ role: 'superadmin' }, 'subadmins.manage'), true);
  assert.equal(hasAdminPermission({ admin_type: 'subadmin', permissions: ['*'] }, 'wallet.view'), true);
});
