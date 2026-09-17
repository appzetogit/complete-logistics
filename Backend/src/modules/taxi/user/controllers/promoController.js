import { ApiError } from '../../../../utils/ApiError.js';
import { listAvailablePromosForUser, validatePromoForContext } from '../../services/promoService.js';

export const validatePromo = async (req, res) => {
  const { code, fare, service_location_id, transport_type } = req.body || {};

  const result = await validatePromoForContext({
    code,
    userId: req.auth?.sub,
    fare,
    service_location_id,
    transport_type,
  });

  res.json({ success: true, data: result });
};

export const getAvailablePromos = async (req, res) => {
  const serviceLocationId = req.query.service_location_id;
  if (!serviceLocationId) {
    throw new ApiError(400, 'service_location_id is required');
  }

  const result = await listAvailablePromosForUser({
    userId: req.auth?.sub,
    service_location_id: serviceLocationId,
    transport_type: req.query.transport_type,
    limit: req.query.limit,
  });

  res.json({ success: true, data: result });
};
