import { ApiError } from '../../../../utils/ApiError.js';
import { getTransportRideSettings } from '../../services/transportSettingsService.js';
import {
  buildDriverRadiusSummary,
  isRadiusWithinLimits,
  parseDriverRadiusConfig,
} from '../../services/driverRadius.js';
import { Driver } from '../models/Driver.js';

const loadConfig = async () => parseDriverRadiusConfig(await getTransportRideSettings());

export const getDriverRadiusSummary = async (driverId) => {
  const [config, driver] = await Promise.all([
    loadConfig(),
    Driver.findById(driverId).select('serviceRadius isCustomRadius').lean(),
  ]);

  if (!driver) {
    throw new ApiError(404, 'Driver not found');
  }

  return buildDriverRadiusSummary(driver, config);
};

/**
 * Saves the signed-in driver's radius preference. The limits are read fresh from the Admin settings on every call and
 * the value is validated here, whatever the app already checked. The effective radius is never taken from the client.
 *
 *   { serviceRadius: 8 }            use my own radius (km)
 *   { isCustomRadius: false }       go back to the Admin default (the saved number is kept)
 */
export const saveDriverRadius = async (driverId, body = {}) => {
  const config = await loadConfig();

  if (!config.allowCustomRadius) {
    throw new ApiError(403, 'Custom radius is not enabled by the admin', { code: 'custom_radius_disabled' });
  }

  const update = {};

  if (body.isCustomRadius === false || body.useDefault === true) {
    update.isCustomRadius = false;
  } else {
    const requested = Number(body.serviceRadius);

    if (body.serviceRadius === undefined || body.serviceRadius === null || body.serviceRadius === '' || !Number.isFinite(requested)) {
      throw new ApiError(400, 'serviceRadius must be a number', { code: 'invalid_radius' });
    }

    if (!isRadiusWithinLimits(requested, config)) {
      throw new ApiError(400, `Radius must be between ${config.minRadius} and ${config.maxRadius} km`, {
        code: 'radius_out_of_range',
        minRadius: config.minRadius,
        maxRadius: config.maxRadius,
      });
    }

    update.serviceRadius = Math.round(requested * 100) / 100;
    update.isCustomRadius = true;
  }

  // one atomic write on this driver's own record
  const driver = await Driver.findByIdAndUpdate(driverId, { $set: update }, { returnDocument: 'after' })
    .select('serviceRadius isCustomRadius')
    .lean();

  if (!driver) {
    throw new ApiError(404, 'Driver not found');
  }

  return buildDriverRadiusSummary(driver, config);
};
