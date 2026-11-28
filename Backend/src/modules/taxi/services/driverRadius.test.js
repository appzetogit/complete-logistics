import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildDriverRadiusSummary,
  hasActiveCustomRadius,
  isRadiusWithinLimits,
  parseDriverRadiusConfig,
  resolveEffectiveRadiusKm,
  validateAdminRadiusSettings,
} from './driverRadius.js';

const settings = (overrides = {}) => ({
  driver_search_radius: '5',
  driver_min_search_radius: '2',
  driver_max_search_radius: '15',
  allow_driver_custom_search_radius: '1',
  ...overrides,
});
const config = (overrides) => parseDriverRadiusConfig(settings(overrides));

test('config: numbers are read from the string settings, the switch is a boolean', () => {
  assert.deepEqual(config(), { defaultRadius: 5, minRadius: 2, maxRadius: 15, allowCustomRadius: true });
  assert.equal(config({ allow_driver_custom_search_radius: '0' }).allowCustomRadius, false);
  assert.equal(config({ allow_driver_custom_search_radius: undefined }).allowCustomRadius, false);
});

test('config: unusable limits never open up custom radii', () => {
  assert.equal(config({ driver_min_search_radius: '0' }).allowCustomRadius, false);
  assert.equal(config({ driver_max_search_radius: 'abc' }).allowCustomRadius, false);
  assert.equal(config({ driver_min_search_radius: '10', driver_max_search_radius: '5' }).allowCustomRadius, false);
  assert.equal(parseDriverRadiusConfig({}).allowCustomRadius, false);
});

test('resolve: new driver and driver without a choice use the Admin default', () => {
  assert.equal(resolveEffectiveRadiusKm({}, config()), 5);
  assert.equal(resolveEffectiveRadiusKm({ serviceRadius: 8, isCustomRadius: false }, config()), 5);
  assert.equal(resolveEffectiveRadiusKm(null, config()), 5);
});

test('resolve: a valid custom radius is used', () => {
  assert.equal(resolveEffectiveRadiusKm({ serviceRadius: 8, isCustomRadius: true }, config()), 8);
  assert.equal(resolveEffectiveRadiusKm({ serviceRadius: 2, isCustomRadius: true }, config()), 2);
  assert.equal(resolveEffectiveRadiusKm({ serviceRadius: 15, isCustomRadius: true }, config()), 15);
});

test('resolve: switch OFF forces the default, the saved value is untouched', () => {
  const driver = { serviceRadius: 8, isCustomRadius: true };
  const off = config({ allow_driver_custom_search_radius: '0' });
  assert.equal(resolveEffectiveRadiusKm(driver, off), 5);
  assert.deepEqual(driver, { serviceRadius: 8, isCustomRadius: true });
  assert.equal(resolveEffectiveRadiusKm(driver, config()), 8, 'switching back on restores it');
});

test('resolve: a saved radius outside the current limits is inactive until corrected', () => {
  const driver = { serviceRadius: 8, isCustomRadius: true };
  assert.equal(resolveEffectiveRadiusKm(driver, config({ driver_max_search_radius: '6' })), 5);
  assert.equal(resolveEffectiveRadiusKm(driver, config({ driver_min_search_radius: '9', driver_max_search_radius: '15', driver_search_radius: '9' })), 9);
  assert.equal(hasActiveCustomRadius(driver, config({ driver_max_search_radius: '6' })), false);
  assert.equal(hasActiveCustomRadius(driver, config({ driver_max_search_radius: '8' })), true, 'limits are inclusive');
});

test('resolve: the default changing reaches default drivers and leaves valid custom ones alone', () => {
  const custom = { serviceRadius: 3, isCustomRadius: true };
  const plain = {};
  const next = config({ driver_search_radius: '6' });
  assert.equal(resolveEffectiveRadiusKm(plain, next), 6);
  assert.equal(resolveEffectiveRadiusKm(custom, next), 3);
});

test('resolve: garbage on the driver record is ignored', () => {
  assert.equal(resolveEffectiveRadiusKm({ serviceRadius: 'abc', isCustomRadius: true }, config()), 5);
  assert.equal(resolveEffectiveRadiusKm({ serviceRadius: null, isCustomRadius: true }, config()), 5);
  assert.equal(resolveEffectiveRadiusKm({ serviceRadius: -3, isCustomRadius: true }, config()), 5);
  assert.equal(resolveEffectiveRadiusKm({ serviceRadius: 8, isCustomRadius: 'yes' }, config()), 5);
});

test('limits check', () => {
  assert.equal(isRadiusWithinLimits(1, config()), false);
  assert.equal(isRadiusWithinLimits(16, config()), false);
  assert.equal(isRadiusWithinLimits(2, config()), true);
  assert.equal(isRadiusWithinLimits('abc', config()), false);
});

test('admin validation: min > 0, max >= min, default inside the range', () => {
  assert.equal(validateAdminRadiusSettings(settings()), null);
  assert.match(validateAdminRadiusSettings(settings({ driver_min_search_radius: '0' })), /Minimum radius must be greater than 0/);
  assert.match(validateAdminRadiusSettings(settings({ driver_min_search_radius: '-1' })), /Minimum/);
  assert.match(validateAdminRadiusSettings(settings({ driver_max_search_radius: '1' })), /Maximum radius must be greater/);
  assert.match(validateAdminRadiusSettings(settings({ driver_search_radius: '1' })), /Default radius must be between/);
  assert.match(validateAdminRadiusSettings(settings({ driver_search_radius: '20' })), /Default radius must be between/);
  assert.match(validateAdminRadiusSettings(settings({ driver_search_radius: '0' })), /Default radius must be greater than 0/);
  assert.equal(validateAdminRadiusSettings(settings({ driver_min_search_radius: '5', driver_max_search_radius: '5' })), null);
});

test('summary: what the driver API returns', () => {
  assert.deepEqual(buildDriverRadiusSummary({ serviceRadius: 8, isCustomRadius: true }, config()), {
    defaultRadius: 5, minRadius: 2, maxRadius: 15, allowCustomRadius: true,
    serviceRadius: 8, isCustomRadius: true, customRadiusActive: true, effectiveRadius: 8,
  });
  assert.deepEqual(buildDriverRadiusSummary({}, config({ allow_driver_custom_search_radius: '0' })), {
    defaultRadius: 5, minRadius: 2, maxRadius: 15, allowCustomRadius: false,
    serviceRadius: null, isCustomRadius: false, customRadiusActive: false, effectiveRadius: 5,
  });
});
