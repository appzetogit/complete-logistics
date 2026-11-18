import mongoose from 'mongoose';
import { ApiError } from '../../../../utils/ApiError.js';
import { Ride } from '../../user/models/Ride.js';
import { User } from '../../user/models/User.js';
import { UserWallet } from '../../user/models/UserWallet.js';
import { Driver } from '../../driver/models/Driver.js';
import { serializeDriverWallet } from '../../driver/services/walletService.js';
import { getWalletSettings } from '../../services/appSettingsService.js';
import { getRideDetails } from '../../services/rideService.js';
import {
  assertSomethingToPay,
  buildCompletionAmounts,
  loadPayableRideForUser,
  recordOptionalRating,
  validateRideCompletionFeedback,
} from '../../user/controllers/rideController.js';
import { buildUserWalletPayload, ensureUserWallet, normalizeMoneyAmount } from '../../user/controllers/userController.js';
import { PaymentOrder, PAYMENT_ORDER_STATUS } from '../models/PaymentOrder.js';
import {
  createGatewayOrder,
  getBackendOrigin,
  handleCashfreeWebhook,
  loadOwnOrder,
  settlePaymentOrder,
} from '../services/paymentOrderService.js';

const notifyUrlFor = (req) => `${getBackendOrigin(req)}/api/v1/payments/cashfree/webhook`;

const customerOf = (person) => ({
  name: person?.name || '',
  phone: person?.phone || '',
  email: person?.email || '',
});

const statusPayload = (settled) => ({
  status: settled.status,
  paid: ['applied', 'already_applied'].includes(settled.status),
  orderId: settled.order.orderId,
  amount: settled.order.amount,
});

// ---- rider wallet ----------------------------------------------------------------------------------------------

export const createUserWalletOrder = async (req, res) => {
  const amount = normalizeMoneyAmount(req.body?.amount);
  const user = await User.findById(req.auth.sub).select('name phone email').lean();
  if (!user) throw new ApiError(404, 'User not found');

  const order = await createGatewayOrder({
    purpose: 'user_wallet_topup',
    ownerType: 'user',
    ownerId: req.auth.sub,
    amount,
    customer: customerOf(user),
    notifyUrl: notifyUrlFor(req),
  });
  res.status(201).json({ success: true, data: order });
};

export const verifyUserWalletOrder = async (req, res) => {
  const order = await loadOwnOrder({
    orderId: req.body?.orderId,
    ownerType: 'user',
    ownerId: req.auth.sub,
    purpose: 'user_wallet_topup',
  });
  const settled = await settlePaymentOrder(order.orderId);
  await ensureUserWallet(req.auth.sub);
  const wallet = await UserWallet.findOne({ userId: req.auth.sub })
    .select('balance refundWallet heldBalance transactions')
    .slice('transactions', -10)
    .lean();
  res.json({ success: true, data: { ...statusPayload(settled), wallet: buildUserWalletPayload(wallet) } });
};

// ---- driver wallet ---------------------------------------------------------------------------------------------

const isOn = (value, fallback = true) => {
  if (value === undefined || value === null || value === '') return fallback;
  return !['0', 'false', 'off', 'no'].includes(String(value).trim().toLowerCase());
};

export const createDriverWalletOrder = async (req, res) => {
  const amount = normalizeMoneyAmount(req.body?.amount);
  const walletSettings = await getWalletSettings();
  if (!isOn(walletSettings.show_wallet_feature_for_driver, true)) {
    throw new ApiError(403, 'Driver wallet is disabled by admin');
  }
  const minimum = Math.max(0, Number(walletSettings.minimum_amount_added_to_wallet || 0) || 0);
  if (minimum > 0 && amount < minimum) {
    throw new ApiError(400, `amount must be at least ${minimum}`);
  }

  const driver = await Driver.findById(req.auth.sub).select('name phone email').lean();
  if (!driver) throw new ApiError(404, 'Driver not found');

  const order = await createGatewayOrder({
    purpose: 'driver_wallet_topup',
    ownerType: 'driver',
    ownerId: req.auth.sub,
    amount,
    customer: customerOf(driver),
    notifyUrl: notifyUrlFor(req),
  });
  res.status(201).json({ success: true, data: order });
};

export const verifyDriverWalletOrder = async (req, res) => {
  const order = await loadOwnOrder({
    orderId: req.body?.orderId,
    ownerType: 'driver',
    ownerId: req.auth.sub,
    purpose: 'driver_wallet_topup',
  });
  const settled = await settlePaymentOrder(order.orderId);
  const driver = await Driver.findById(req.auth.sub);
  res.json({
    success: true,
    data: { ...statusPayload(settled), wallet: driver ? await serializeDriverWallet(driver) : null },
  });
};

// ---- ride completion payment -----------------------------------------------------------------------------------

export const createRideCompletionOrder = async (req, res) => {
  const rideId = String(req.params.rideId || '').trim();
  const { tipAmount } = await validateRideCompletionFeedback({
    rating: req.body?.rating,
    tipAmount: req.body?.tipAmount,
  });

  const ride = await loadPayableRideForUser(rideId, req.auth.sub);
  const amounts = buildCompletionAmounts(ride, tipAmount);
  assertSomethingToPay(ride, amounts);

  // A double tap (or reopening the pay sheet) gets the same open order, so the rider can never pay two.
  const open = ride.riderPaymentOrder;
  if (open?.orderId) {
    const existing = await PaymentOrder.findOne({ orderId: open.orderId, gateway: 'cashfree', status: PAYMENT_ORDER_STATUS.CREATED }).lean();
    if (
      existing
      && existing.paymentSessionId
      && Math.round(existing.amount * 100) === Math.round(amounts.totalCharge * 100)
      && Math.round(Number(existing.context?.fareDue || 0) * 100) === Math.round(amounts.fareDue * 100)
      && Math.round(Number(existing.context?.tipAmount || 0) * 100) === Math.round(amounts.tipAmount * 100)
    ) {
      res.status(201).json({
        success: true,
        data: {
          orderId: existing.orderId,
          paymentSessionId: existing.paymentSessionId,
          amount: existing.amount,
          currency: 'INR',
          fare: amounts.fare,
          fareDue: amounts.fareDue,
          tipAmount: amounts.tipAmount,
          totalCharge: amounts.totalCharge,
          reused: true,
        },
      });
      return;
    }
  }

  const user = await User.findById(req.auth.sub).select('name phone email').lean();
  const order = await createGatewayOrder({
    purpose: 'ride_payment',
    ownerType: 'user',
    ownerId: req.auth.sub,
    amount: amounts.totalCharge,
    customer: customerOf(user),
    context: { rideId, fareDue: amounts.fareDue, tipAmount: amounts.tipAmount },
    notifyUrl: notifyUrlFor(req),
  });

  await Ride.updateOne(
    { _id: ride._id },
    {
      $set: {
        riderPaymentOrder: {
          orderId: order.orderId,
          amountPaise: Math.round(amounts.totalCharge * 100),
          fareDue: amounts.fareDue,
          tipAmount: amounts.tipAmount,
          createdAt: new Date(),
        },
      },
    },
  );

  res.status(201).json({
    success: true,
    data: {
      ...order,
      fare: amounts.fare,
      fareDue: amounts.fareDue,
      tipAmount: amounts.tipAmount,
      totalCharge: amounts.totalCharge,
      reused: false,
    },
  });
};

export const verifyRideCompletionOrder = async (req, res) => {
  const rideId = String(req.params.rideId || '').trim();
  const comment = String(req.body?.comment || '');
  const { rating } = await validateRideCompletionFeedback({ rating: req.body?.rating, tipAmount: 0 });
  if (!mongoose.isValidObjectId(rideId)) throw new ApiError(404, 'Ride not found');

  const order = await loadOwnOrder({
    orderId: req.body?.orderId,
    ownerType: 'user',
    ownerId: req.auth.sub,
    purpose: 'ride_payment',
  });
  // An order opened for one ride can never pay another.
  if (String(order.context?.rideId || '') !== rideId) {
    throw new ApiError(400, 'This payment was not made for this ride');
  }

  const settled = await settlePaymentOrder(order.orderId);

  if (['refunded', 'refund_pending'].includes(settled.status)) {
    // Paid, but the ride could not use it (already paid, cancelled): it goes back to the rider.
    throw new ApiError(409, 'This payment could not be used for the ride and is being refunded', {
      code: 'payment_refunded',
      status: settled.status,
    });
  }

  if (settled.status === 'pending') {
    res.json({ success: true, data: { ...statusPayload(settled), ride: null } });
    return;
  }

  await recordOptionalRating({ rideId, userId: req.auth.sub, rating, comment });
  res.json({ success: true, data: { ...statusPayload(settled), ride: await getRideDetails(rideId) } });
};

// ---- webhook ---------------------------------------------------------------------------------------------------

export const cashfreeWebhook = async (req, res) => {
  const result = await handleCashfreeWebhook({
    rawBody: req.rawBody,
    signature: String(req.get('x-webhook-signature') || ''),
    timestamp: String(req.get('x-webhook-timestamp') || ''),
  });
  res.json({ success: true, ...result });
};
