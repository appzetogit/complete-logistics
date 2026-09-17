export const toPlainData = (value) => {
  if (value === null || value === undefined) {
    return value;
  }

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return null;
  }
};

export const buildBusRouteState = (baseState = {}, overrides = {}) => {
  const safeBaseState = toPlainData(baseState) || {};
  const safeOverrides = toPlainData(overrides) || {};

  return {
    ...safeBaseState,
    ...safeOverrides,
  };
};
