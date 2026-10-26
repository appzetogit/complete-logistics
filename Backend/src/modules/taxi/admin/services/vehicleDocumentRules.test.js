// node --test src/modules/taxi/admin/services/vehicleDocumentRules.test.js
import assert from 'node:assert/strict';
import test from 'node:test';
import { filterDocumentsForVehicle, normalizeVehicleDocumentIds } from './vehicleDocumentRules.js';

const A = 'a'.repeat(24);
const B = 'b'.repeat(24);
const C = 'c'.repeat(24);
const templates = [{ id: A, name: 'PAN' }, { id: B, name: 'Permit' }, { _id: C, name: 'PUC' }];

test('a vehicle with no documents picked asks for all of them', () => {
  assert.equal(filterDocumentsForVehicle(templates, null), templates);
  assert.equal(filterDocumentsForVehicle(templates, {}), templates);
  assert.equal(filterDocumentsForVehicle(templates, { required_document_ids: [] }), templates);
});

test('only the picked documents are kept', () => {
  assert.deepEqual(
    filterDocumentsForVehicle(templates, { required_document_ids: [A, C] }).map((item) => item.name),
    ['PAN', 'PUC'],
  );
});

test('ids are cleaned: duplicates, junk and objects', () => {
  assert.deepEqual(normalizeVehicleDocumentIds([A, A, 'x', null, { _id: B }]), [A, B]);
  assert.deepEqual(normalizeVehicleDocumentIds('nope'), []);
});

test('picking only ids that no longer exist leaves the vehicle with no documents', () => {
  assert.deepEqual(filterDocumentsForVehicle(templates, { required_document_ids: ['d'.repeat(24)] }), []);
});
