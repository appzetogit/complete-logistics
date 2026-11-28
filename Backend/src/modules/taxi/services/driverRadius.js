/*
 * Hybrid driver radius: the Admin sets the default radius, the allowed range and an ON/OFF switch; a driver may then
 * pick their own radius inside that range. Everything here is pure (no database), so the same rules serve the
 * driver API, the Admin validation and ride matching.
 *
 * Admin values live in AdminBusinessSetting.transport_ride (string values, kilometres):
 *   driver_search_radius                the default radius (already existed)
 *   driver_min_search_radius            smallest radius a driver may pick
 *   driver_max_search_radius            largest radius a driver may pick
 *   allow_driver_custom_search_radius   '1' = drivers may use their own radius, '0' = everyone uses the default
 * Driver values live on the driver record: serviceRadius (km) and isCustomRadius.
 */

const toPositive = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
};

const isOn = (value) => ['1', 'true', 'yes', 'on'].includes(String(value ?? '').trim().toLowerCase());

/**
 * The radius configuration, read from the transport settings. `allowCustomRadius` is only true when the Admin switched
 * it on AND the limits are usable: a broken configuration never opens up custom radii.
 */
export const parseDriverRadiusConfig = (settings = {}) => {
  const defaultRadius = toPositive(settings.driver_search_radius);
  const minRadius = toPositive(settings.driver_min_search_radius);
  const maxRadius = toPositive(settings.driver_max_search_radius);
  const limitsUsable = minRadius !== null && maxRadius !== null && minRadius <= maxRadius;

  return {
    defaultRadius,
    minRadius,
    maxRadius,
    allowCustomRadius: isOn(settings.allow_driver_custom_search_radius) && limitsUsable,
  };
};

export const isRadiusWithinLimits = (radius, config) => {
  if (radius === null || radius === undefined || radius === '') {
    return false;
  }

  const numeric = Number(radius);
  return (
    Number.isFinite(numeric) &&
    config.minRadius !== null &&
    config.maxRadius !== null &&
    numeric >= config.minRadius &&
    numeric <= config.maxRadius
  );
};

/** True when this driver's own radius is in force right now (switch ON, chosen by the driver, inside today's limits). */
export const hasActiveCustomRadius = (driver, config) =>
  Boolean(config?.allowCustomRadius) &&
  driver?.isCustomRadius === true &&
  isRadiusWithinLimits(driver?.serviceRadius, config);

/**
 * The radius (km) used for this driver. A saved preference that is outside today's limits is not used and is not
 * deleted: the driver falls back to the Admin default until they choose a valid radius again.
 */
export const resolveEffectiveRadiusKm = (driver, config) =>
  hasActiveCustomRadius(driver, config) ? Number(driver.serviceRadius) : config?.defaultRadius ?? null;

/**
 * Checks the Admin's radius settings after a change. `merged` is the full transport settings that would be saved.
 * Returns an error message, or null when they are fine.
 */
export const validateAdminRadiusSettings = (merged = {}) => {
  const minRadius = Number(merged.driver_min_search_radius);
  const maxRadius = Number(merged.driver_max_search_radius);
  const defaultRadius = Number(merged.driver_search_radius);

  if (!Number.isFinite(minRadius) || minRadius <= 0) {
    return 'Minimum radius must be greater than 0';
  }
  if (!Number.isFinite(maxRadius) || maxRadius < minRadius) {
    return 'Maximum radius must be greater than or equal to the minimum radius';
  }
  if (!Number.isFinite(defaultRadius) || defaultRadius <= 0) {
    return 'Default radius must be greater than 0';
  }
  if (defaultRadius < minRadius || defaultRadius > maxRadius) {
    return `Default radius must be between the minimum (${minRadius}) and maximum (${maxRadius}) radius`;
  }

  return null;
};

export const RADIUS_SETTING_KEYS = [
  'driver_search_radius',
  'driver_min_search_radius',
  'driver_max_search_radius',
  'allow_driver_custom_search_radius',
];

/** What the driver APIs return. Never includes anything the driver could use to change Admin settings. */
export const buildDriverRadiusSummary = (driver, config) => {
  const customActive = hasActiveCustomRadius(driver, config);

  return {
    defaultRadius: config.defaultRadius,
    minRadius: config.minRadius,
    maxRadius: config.maxRadius,
    allowCustomRadius: config.allowCustomRadius,
    serviceRadius: typeof driver?.serviceRadius === 'number' && Number.isFinite(driver.serviceRadius) ? driver.serviceRadius : null,
    isCustomRadius: driver?.isCustomRadius === true,
    // true when the saved preference is what matching uses right now
    customRadiusActive: customActive,
    effectiveRadius: resolveEffectiveRadiusKm(driver, config),
  };
};
