import mongoose from 'mongoose';
import { ApiError } from '../../../../utils/ApiError.js';
import { buildScopeFilter, getActiveScope, isLocationInScope, SCOPE_RULES } from './adminScopeService.js';

/*
 * Global mongoose plugin: while an admin request has a scope (adminScopeService), every query on a scoped model
 * is limited to the allowed service locations. Outside such a request it does nothing, so apps, sockets and jobs
 * are untouched. A query can opt out with .setOptions({ skipAdminScope: true }) (used to resolve the scope itself).
 *
 * This file must be imported before any model is compiled (src/app.js imports it first).
 */

const QUERY_HOOKS = [
  'find',
  'findOne',
  'countDocuments',
  'distinct',
  'findOneAndUpdate',
  'findOneAndDelete',
  'findOneAndReplace',
  'updateOne',
  'updateMany',
  'deleteOne',
  'deleteMany',
  'replaceOne',
];

// Stages that must stay first in a pipeline.
const MUST_BE_FIRST = ['$geoNear', '$search', '$searchMeta', '$vectorSearch', '$collStats', '$indexStats'];

export const adminScopePlugin = (schema) => {
  schema.pre(QUERY_HOOKS, async function applyAdminScope() {
    const scope = getActiveScope();
    if (!scope || this.getOptions?.().skipAdminScope) return;
    const filter = await buildScopeFilter(this.model?.modelName, scope);
    if (filter) this.and([filter]);
  });

  schema.pre('aggregate', async function applyAdminScopeToPipeline() {
    const scope = getActiveScope();
    if (!scope || this.options?.skipAdminScope) return;
    const filter = await buildScopeFilter(this.model()?.modelName, scope);
    if (!filter) return;
    const pipeline = this.pipeline();
    const firstStage = Object.keys(pipeline[0] || {})[0];
    pipeline.splice(MUST_BE_FIRST.includes(firstStage) ? 1 : 0, 0, { $match: filter });
  });

  // A scoped admin can only create records inside their own scope.
  schema.pre('save', function limitNewRecordsToScope() {
    const scope = getActiveScope();
    const modelName = this.constructor?.modelName;
    const rule = SCOPE_RULES[modelName];
    if (!rule?.field || rule.field === '_id' || !this.isNew) return;

    // a new record's area label follows its dispatch service location when it has one (any context)
    if (rule.mirrorFrom && !this.get(rule.field) && this.get(rule.mirrorFrom)) {
      this.set(rule.field, this.get(rule.mirrorFrom));
    }
    if (!scope) return;

    if (!this.get(rule.field)) {
      // one allowed location: that is where the record belongs; otherwise the admin must choose
      if (scope.locationIds.length === 1) {
        this.set(rule.field, scope.locationIds[0]);
        return;
      }
      throw new ApiError(400, 'Select a service location within your assigned area');
    }
    if (!isLocationInScope(this.get(rule.field), scope)) {
      throw new ApiError(403, 'Service location is outside your assigned scope');
    }
  });
};

mongoose.plugin(adminScopePlugin);
