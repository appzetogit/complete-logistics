import { createDeliveryRecord, getActiveDeliveryForIdentity, getDeliveryById, listDeliveriesForIdentity, quoteDeliveryFare } from '../services/deliveryService.js';
import { startDispatchFlow } from '../../services/dispatchService.js';
import { getRideDetails } from '../../services/rideService.js';
import {
  createGoodsAdvanceOrder,
  payGoodsAdvanceWithWallet,
  verifyGoodsAdvancePayment,
} from '../services/goodsAdvanceService.js';
import { serializeDeliveryRealtime } from '../services/deliveryService.js';

export const createDelivery = async (req, res) => {
  const { pickup, drop, pickupAddress, dropAddress, fare, vehicleTypeId, vehicleTypeIds, vehicleIconType, vehicleIconUrl, paymentMethod, parcel, loadHeightKey, extraKeys, advancePercent } = req.body;

  const delivery = await createDeliveryRecord({
    userId: req.auth.sub,
    pickup,
    drop,
    pickupAddress,
    dropAddress,
    fare,
    vehicleTypeId,
    vehicleTypeIds,
    vehicleIconType,
    vehicleIconUrl,
    paymentMethod,
    parcel,
    loadHeightKey,
    extraKeys,
    advancePercent,
  });

  res.status(201).json({
    success: true,
    data: delivery,
  });
};

/// Priced quote for the vehicle options screen, before the rider commits.
export const quoteDelivery = async (req, res) => {
  const { vehicleTypeId, pickup, drop, loadHeightKey, extraKeys, parcel } = req.body;

  const quote = await quoteDeliveryFare({
    vehicleTypeId,
    pickup,
    drop,
    loadHeightKey,
    extraKeys,
    parcel,
  });

  res.json({
    success: true,
    data: quote,
  });
};

export const getMyActiveDelivery = async (req, res) => {
  const delivery = await getActiveDeliveryForIdentity({
    role: req.auth.role,
    entityId: req.auth.sub,
  });

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  res.json({
    success: true,
    data: delivery,
  });
};

export const getDelivery = async (req, res) => {
  const delivery = await getDeliveryById({
    deliveryId: req.params.deliveryId,
    role: req.auth.role,
    entityId: req.auth.sub,
  });

  res.json({
    success: true,
    data: delivery,
  });
};

export const listMyDeliveries = async (req, res) => {
  const deliveries = await listDeliveriesForIdentity({
    role: req.auth.role,
    entityId: req.auth.sub,
    limit: req.query.limit,
  });

  res.json({
    success: true,
    data: {
      results: deliveries,
      total: deliveries.length,
    },
  });
};

// ---- Goods advance (paid online before the request is dispatched) ----------

const respondAfterAdvancePaid = async (res, { ride, status = 200 }) => {
  const detailed = await getRideDetails(ride._id);
  // Idempotent: a no-op if dispatch is already running or the ride was taken.
  if (detailed.status === 'searching' && !detailed.driverId) {
    await startDispatchFlow(detailed);
  }

  res.status(status).json({
    success: true,
    data: serializeDeliveryRealtime(detailed),
  });
};

export const createGoodsAdvanceRazorpayOrder = async (req, res) => {
  const data = await createGoodsAdvanceOrder({
    rideId: String(req.body?.rideId || '').trim(),
    userId: req.auth.sub,
  });

  res.status(201).json({ success: true, data });
};

export const verifyGoodsAdvanceRazorpayPayment = async (req, res) => {
  const { ride } = await verifyGoodsAdvancePayment({
    rideId: String(req.body?.rideId || '').trim(),
    userId: req.auth.sub,
    orderId: String(req.body?.razorpay_order_id || ''),
    paymentId: String(req.body?.razorpay_payment_id || ''),
    signature: String(req.body?.razorpay_signature || ''),
  });

  await respondAfterAdvancePaid(res, { ride });
};

export const payGoodsAdvanceFromWallet = async (req, res) => {
  const { ride, alreadyPaid } = await payGoodsAdvanceWithWallet({
    rideId: String(req.body?.rideId || '').trim(),
    userId: req.auth.sub,
  });

  await respondAfterAdvancePaid(res, { ride, status: alreadyPaid ? 200 : 201 });
};
