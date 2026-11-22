import assert from 'node:assert/strict';
import test from 'node:test';
import { genericVehicleTypeOf } from './genericVehicleType.js';

test('two-wheelers are bikes (a scooty must not be drawn as a car)', () => {
  for (const value of ['bike', 'Bike Direct', 'scooty', 'Scooty Parcel', 'scooter', 'moped', 'Activa']) {
    assert.equal(genericVehicleTypeOf(value), 'bike', value);
  }
});

test('autos stay autos and everything else is a car', () => {
  for (const value of ['auto', 'Auto Animal', '3-Wheeler Auto']) assert.equal(genericVehicleTypeOf(value), 'auto', value);
  for (const value of ['car', 'Cab AC', 'truck', 'mini_bus', 'LCV', 'bus', '', null, undefined]) assert.equal(genericVehicleTypeOf(value), 'car', String(value));
});
