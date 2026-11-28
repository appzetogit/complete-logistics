import { getDriverRadiusSummary, saveDriverRadius } from '../services/driverRadiusService.js';

// The driver is always the one in the token: there is no id in the path or body to point at someone else.
export const getServiceRadius = async (req, res) => {
  res.json({ success: true, data: await getDriverRadiusSummary(req.auth.sub) });
};

export const updateServiceRadius = async (req, res) => {
  res.json({
    success: true,
    message: 'Service radius saved',
    data: await saveDriverRadius(req.auth.sub, req.body || {}),
  });
};
