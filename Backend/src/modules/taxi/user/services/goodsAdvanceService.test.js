// node --test src/modules/taxi/user/services/goodsAdvanceService.test.js
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';

process.env.MONGODB_URI ??= 'mongodb://127.0.0.1:27017';
process.env.JWT_SECRET ??= 'test-secret-for-goods-advance';

const {
  computeGoodsAdvance,
  createGoodsAdvanceOrder,
  forfeitGoodsAdvance,
  getRemainingFare,
  isDispatchBlockedByAdvance,
  payGoodsAdvanceWithWallet,
  refundGoodsAdvance,
  resolveGoodsAdvanceForNewRide,
  verifyGoodsAdvancePayment,
} = await import('./goodsAdvanceService.js');
const { computeRideSettlementAmount } = await import('../../driver/services/walletService.js');

// ---- tiny in-memory stand-ins for the Mongoose models ----------------------

const getPath = (object, path) => path.split('.').reduce((value, key) => value?.[key], object);
const setPath = (object, path, value) => {
  const keys = path.split('.');
  const last = keys.pop();
  const target = keys.reduce((node, key) => (node[key] ??= {}), object);
  target[last] = value;
};
const matches = (doc, filter) =>
  Object.entries(filter).every(([key, expected]) => {
    const actual = getPath(doc, key);
    if (expected && typeof expected === 'object' && '$ne' in expected) {
      return String(actual) !== String(expected.$ne);
    }
    if (expected && typeof expected === 'object' && '$gte' in expected) {
      return Number(actual) >= expected.$gte;
    }
    return String(actual) === String(expected);
  });

const makeRideModel = (docs) => {
  const store = new Map(docs.map((doc) => [String(doc._id), structuredClone(doc)]));
  const find = (filter) => [...store.values()].find((doc) => matches(doc, filter)) || null;
  const apply = (doc, update) => {
    for (const [path, value] of Object.entries(update.$set || {})) setPath(doc, path, value);
  };

  return {
    store,
    findOne: async (filter) => find(filter),
    findById: async (id) => ({ ...(store.get(String(id)) || {}), lean() { return this; }, select() { return this; } }),
    exists: async (filter) => (find(filter) ? { _id: 1 } : null),
    updateOne: async (filter, update) => {
      const doc = find(filter);
      if (!doc) return { modifiedCount: 0 };
      apply(doc, update);
      return { modifiedCount: 1 };
    },
    findOneAndUpdate: async (filter, update, options = {}) => {
      const doc = find(filter);
      if (!doc) return null;
      const before = structuredClone(doc);
      apply(doc, update);
      return options.returnDocument === 'before' ? before : structuredClone(doc);
    },
  };
};

const makeWalletModel = (initial = { balance: 0, refundWallet: 0 }) => {
  const wallet = { ...initial, transactions: [] };
  return {
    wallet,
    updateOne: async (filter, update) => {
      if (update.$setOnInsert) return { modifiedCount: 0 };
      if (filter.balance && !(wallet.balance >= filter.balance.$gte)) return { modifiedCount: 0 };
      for (const [field, amount] of Object.entries(update.$inc || {})) wallet[field] += amount;
      wallet.transactions.push(...(update.$push?.transactions?.$each || []));
      return { modifiedCount: 1 };
    },
  };
};

// Transaction stand-in: runs the work, and restores the ride store if it throws.
const rollbackTxn = (Ride) => async (work) => {
  const snapshot = new Map([...Ride.store].map(([key, value]) => [key, structuredClone(value)]));
  try {
    return await work(undefined);
  } catch (error) {
    Ride.store.clear();
    snapshot.forEach((value, key) => Ride.store.set(key, value));
    throw error;
  }
};

const SECRET = 'rzp-test-secret';
const signature = (orderId, paymentId) =>
  crypto.createHmac('sha256', SECRET).update(`${orderId}|${paymentId}`).digest('hex');

const baseRide = (overrides = {}) => ({
  _id: 'ride1',
  userId: 'user1',
  driverId: null,
  serviceType: 'parcel',
  status: 'searching',
  fare: 1000,
  goodsAdvance: { percent: 20, amount: 200, status: 'pending', providerOrderId: 'order_1' },
  ...overrides,
});

const razorpayFor = (ride, { amount = 20000, rideId = ride._id, userId = ride.userId, purpose = 'goods_advance' } = {}) => ({
  resolveCredentials: async () => ({ keyId: 'k', keySecret: SECRET }),
  razorpayRequest: async ({ method }) =>
    method === 'GET'
      ? { id: 'order_1', amount, notes: { rideId, userId, purpose } }
      : { id: 'order_1', amount: 20000, currency: 'INR' },
});

// ---- amounts & rules --------------------------------------------------------

test('20% advance: 1000 -> 200 now, 800 on completion', () => {
  assert.deepEqual(computeGoodsAdvance({ fare: 1000, percent: 20 }), { percent: 20, amount: 200, remainingAmount: 800 });
  assert.equal(computeGoodsAdvance({ fare: 333.33, percent: 20 }).amount, 66.67);
  assert.equal(computeGoodsAdvance({ fare: 1000, percent: 0 }).amount, 0);
  assert.equal(computeGoodsAdvance({ fare: 1000, percent: 500 }).amount, 1000);
});

test('only goods bookings get an advance, never waived ones', async () => {
  const getConfig = async () => ({ percent: 20, refundTo: 'refund_wallet' });
  assert.deepEqual(
    await resolveGoodsAdvanceForNewRide({ serviceType: 'parcel', fare: 500, deps: { getConfig } }),
    { percent: 20, amount: 100, status: 'pending' },
  );
  assert.equal(await resolveGoodsAdvanceForNewRide({ serviceType: 'ride', fare: 500, deps: { getConfig } }), undefined);
  assert.equal(await resolveGoodsAdvanceForNewRide({ serviceType: 'parcel', fare: 500, waived: true, deps: { getConfig } }), undefined);
  assert.equal(
    await resolveGoodsAdvanceForNewRide({ serviceType: 'parcel', fare: 500, deps: { getConfig: async () => ({ percent: 0 }) } }),
    undefined,
  );
});

test('dispatch is blocked only while the advance is pending', () => {
  assert.equal(isDispatchBlockedByAdvance({ goodsAdvance: { status: 'pending' } }), true);
  for (const status of ['paid', 'none', 'refunded', 'forfeited']) {
    assert.equal(isDispatchBlockedByAdvance({ goodsAdvance: { status } }), false);
  }
  assert.equal(isDispatchBlockedByAdvance({}), false);
});

test('remaining fare = fare - advance while pending/paid', () => {
  assert.equal(getRemainingFare({ fare: 1000, goodsAdvance: { status: 'paid', amount: 200 } }), 800);
  assert.equal(getRemainingFare({ fare: 1000, goodsAdvance: { status: 'pending', amount: 200 } }), 800);
  assert.equal(getRemainingFare({ fare: 1000 }), 1000);
});

// ---- paying the advance ------------------------------------------------------

test('creating an order stores the order id on the ride', async () => {
  const Ride = makeRideModel([baseRide({ goodsAdvance: { percent: 20, amount: 200, status: 'pending' } })]);
  const result = await createGoodsAdvanceOrder({ rideId: 'ride1', userId: 'user1', deps: { Ride, ...razorpayFor(baseRide()) } });
  assert.equal(result.advanceAmount, 200);
  assert.equal(Ride.store.get('ride1').goodsAdvance.providerOrderId, 'order_1');
});

test('verify: valid payment marks the advance paid, and repeating it is a no-op', async () => {
  const ride = baseRide();
  const Ride = makeRideModel([ride]);
  const args = { rideId: 'ride1', userId: 'user1', orderId: 'order_1', paymentId: 'pay_1', signature: signature('order_1', 'pay_1') };

  const first = await verifyGoodsAdvancePayment({ ...args, deps: { Ride, ...razorpayFor(ride) } });
  assert.equal(first.alreadyPaid, false);
  assert.equal(Ride.store.get('ride1').goodsAdvance.status, 'paid');

  const second = await verifyGoodsAdvancePayment({ ...args, deps: { Ride, ...razorpayFor(ride) } });
  assert.equal(second.alreadyPaid, true);
});

test('verify rejects bad signature, wrong order, wrong amount, and orders for another ride/user', async () => {
  const ride = baseRide();
  const attempt = (overrides, order) => {
    const Ride = makeRideModel([ride]);
    return verifyGoodsAdvancePayment({
      rideId: 'ride1',
      userId: 'user1',
      orderId: 'order_1',
      paymentId: 'pay_1',
      signature: signature('order_1', 'pay_1'),
      ...overrides,
      deps: { Ride, ...razorpayFor(ride, order) },
    });
  };

  await assert.rejects(attempt({ signature: 'nope' }), /Invalid payment signature/);
  await assert.rejects(attempt({ orderId: 'order_other', signature: signature('order_other', 'pay_1') }), /does not belong/);
  await assert.rejects(attempt({}, { amount: 100 }), /does not match/);
  await assert.rejects(attempt({}, { rideId: 'someone-elses-ride' }), /does not match/);
  await assert.rejects(attempt({}, { userId: 'someone-else' }), /does not match/);
  await assert.rejects(attempt({}, { purpose: 'wallet_topup' }), /does not match/);
});

test('verify: a payment id cannot be reused for a different booking', async () => {
  const other = baseRide({ _id: 'ride2', goodsAdvance: { percent: 20, amount: 200, status: 'paid', providerPaymentId: 'pay_1', providerOrderId: 'order_x' } });
  const ride = baseRide();
  const Ride = makeRideModel([ride, other]);
  await assert.rejects(
    verifyGoodsAdvancePayment({
      rideId: 'ride1', userId: 'user1', orderId: 'order_1', paymentId: 'pay_1', signature: signature('order_1', 'pay_1'),
      deps: { Ride, ...razorpayFor(ride) },
    }),
    /already used/,
  );
});

test("verify: another user cannot pay or verify someone else's booking", async () => {
  const ride = baseRide();
  const Ride = makeRideModel([ride]);
  await assert.rejects(
    verifyGoodsAdvancePayment({
      rideId: 'ride1', userId: 'intruder', orderId: 'order_1', paymentId: 'pay_1', signature: signature('order_1', 'pay_1'),
      deps: { Ride, ...razorpayFor(ride) },
    }),
    /not found/,
  );
});

test('wallet payment debits once, rejects insufficient balance, and is idempotent', async () => {
  const Ride = makeRideModel([baseRide()]);
  const UserWallet = makeWalletModel({ balance: 500, refundWallet: 0 });

  const first = await payGoodsAdvanceWithWallet({ rideId: 'ride1', userId: 'user1', deps: { Ride, UserWallet, runInTransaction: rollbackTxn(Ride) } });
  assert.equal(first.alreadyPaid, false);
  assert.equal(UserWallet.wallet.balance, 300);
  assert.equal(Ride.store.get('ride1').goodsAdvance.status, 'paid');

  const second = await payGoodsAdvanceWithWallet({ rideId: 'ride1', userId: 'user1', deps: { Ride, UserWallet, runInTransaction: rollbackTxn(Ride) } });
  assert.equal(second.alreadyPaid, true);
  assert.equal(UserWallet.wallet.balance, 300);

  const poor = makeWalletModel({ balance: 50, refundWallet: 0 });
  await assert.rejects(
    (() => { const Ride3 = makeRideModel([baseRide({ _id: 'ride3' })]); return payGoodsAdvanceWithWallet({ rideId: 'ride3', userId: 'user1', deps: { Ride: Ride3, UserWallet: poor, runInTransaction: rollbackTxn(Ride3) } }); })(),
    /Insufficient wallet balance/,
  );
  assert.equal(poor.wallet.balance, 50);
});

// ---- refund / forfeit --------------------------------------------------------

const paidRide = (overrides = {}) =>
  baseRide({
    goodsAdvance: { percent: 20, amount: 200, status: 'paid', provider: 'razorpay', providerPaymentId: 'pay_1' },
    ...overrides,
  });

test('refund (driver cancel / no driver / admin): advance returns to refundWallet once', async () => {
  const Ride = makeRideModel([paidRide()]);
  const UserWallet = makeWalletModel();
  const deps = { Ride, UserWallet, runInTransaction: rollbackTxn(Ride), getConfig: async () => ({ refundTo: 'refund_wallet' }) };

  const first = await refundGoodsAdvance({ rideId: 'ride1', reason: 'no_driver_found', deps });
  assert.deepEqual(first, { refunded: true, destination: 'refund_wallet', amount: 200 });
  assert.equal(UserWallet.wallet.refundWallet, 200);
  assert.equal(Ride.store.get('ride1').goodsAdvance.status, 'refunded');

  const second = await refundGoodsAdvance({ rideId: 'ride1', deps });
  assert.equal(second.refunded, false);
  assert.equal(UserWallet.wallet.refundWallet, 200);
});

test('refund destination can be the spendable wallet or the original Razorpay payment', async () => {
  const walletRide = makeRideModel([paidRide()]);
  const wallet = makeWalletModel();
  await refundGoodsAdvance({ rideId: 'ride1', deps: { Ride: walletRide, UserWallet: wallet, runInTransaction: rollbackTxn(walletRide), getConfig: async () => ({ refundTo: 'wallet' }) } });
  assert.equal(wallet.wallet.balance, 200);

  const sourceRide = makeRideModel([paidRide()]);
  const calls = [];
  const result = await refundGoodsAdvance({
    rideId: 'ride1',
    deps: {
      Ride: sourceRide,
      UserWallet: makeWalletModel(),
      getConfig: async () => ({ refundTo: 'source' }),
      resolveCredentials: async () => ({ keyId: 'k', keySecret: 's' }),
      razorpayRequest: async (request) => { calls.push(request); return {}; },
    },
  });
  assert.equal(result.destination, 'source');
  assert.equal(calls[0].path, '/payments/pay_1/refund');
  assert.equal(calls[0].body.amount, 20000);
});

test('a failed wallet refund rolls back completely: the advance stays paid and can be retried', async () => {
  const Ride = makeRideModel([paidRide()]);
  const failing = makeWalletModel();
  const realUpdate = failing.updateOne;
  failing.updateOne = async (filter, update, options) => {
    if (update.$inc) throw new Error('db down');
    return realUpdate(filter, update, options);
  };
  const deps = { Ride, runInTransaction: rollbackTxn(Ride), getConfig: async () => ({ refundTo: 'refund_wallet' }) };

  await assert.rejects(refundGoodsAdvance({ rideId: 'ride1', deps: { ...deps, UserWallet: failing } }), /db down/);
  assert.equal(Ride.store.get('ride1').goodsAdvance.status, 'paid');

  const healthy = makeWalletModel();
  const retry = await refundGoodsAdvance({ rideId: 'ride1', deps: { ...deps, UserWallet: healthy } });
  assert.equal(retry.refunded, true);
  assert.equal(healthy.wallet.refundWallet, 200);
});

test('a failed Razorpay refund puts the advance back to paid so it can be retried', async () => {
  const Ride = makeRideModel([paidRide()]);
  await assert.rejects(
    refundGoodsAdvance({
      rideId: 'ride1',
      deps: {
        Ride,
        UserWallet: makeWalletModel(),
        getConfig: async () => ({ refundTo: 'source' }),
        resolveCredentials: async () => ({ keyId: 'k', keySecret: 's' }),
        razorpayRequest: async () => { throw new Error('gateway down'); },
      },
    }),
    /gateway down/,
  );
  assert.equal(Ride.store.get('ride1').goodsAdvance.status, 'paid');
});

test('rider cancel forfeits the advance: no refund, now or later', async () => {
  const Ride = makeRideModel([paidRide({ driverId: 'driver1' })]);
  const UserWallet = makeWalletModel();

  const forfeit = await forfeitGoodsAdvance({ rideId: 'ride1', deps: { Ride } });
  assert.equal(forfeit.forfeited, true);
  assert.equal(Ride.store.get('ride1').goodsAdvance.status, 'forfeited');

  const refund = await refundGoodsAdvance({ rideId: 'ride1', deps: { Ride, UserWallet, getConfig: async () => ({ refundTo: 'refund_wallet' }) } });
  assert.equal(refund.refunded, false);
  assert.equal(UserWallet.wallet.refundWallet, 0);
  assert.equal((await forfeitGoodsAdvance({ rideId: 'ride1', deps: { Ride } })).forfeited, false);
});

test('forfeited advance can go to the driver when the pricing rule says so', async () => {
  const Ride = makeRideModel([paidRide({ driverId: 'driver1' })]);
  const credits = [];
  const result = await forfeitGoodsAdvance({
    rideId: 'ride1',
    creditDriver: true,
    deps: { Ride, runInTransaction: rollbackTxn(Ride), applyDriverWalletAdjustment: async (args) => { credits.push(args); } },
  });
  assert.equal(result.creditedToDriver, true);
  assert.equal(credits[0].amount, 200);
  assert.equal(credits[0].driverId, 'driver1');
});

test('if crediting the driver fails, the advance is still forfeited (platform keeps it)', async () => {
  const Ride = makeRideModel([paidRide({ driverId: 'driver1' })]);
  const originalError = console.error;
  console.error = () => {};
  try {
    const result = await forfeitGoodsAdvance({
      rideId: 'ride1',
      creditDriver: true,
      deps: {
        Ride,
        runInTransaction: rollbackTxn(Ride),
        applyDriverWalletAdjustment: async () => { throw new Error('wallet down'); },
      },
    });
    assert.equal(result.forfeited, true);
    assert.equal(result.creditedToDriver, false);
    assert.equal(Ride.store.get('ride1').goodsAdvance.status, 'forfeited');
  } finally {
    console.error = originalError;
  }
});

test('nothing to refund before the advance is paid, or on a non-goods ride', async () => {
  const pending = makeRideModel([baseRide()]);
  assert.equal((await refundGoodsAdvance({ rideId: 'ride1', deps: { Ride: pending, UserWallet: makeWalletModel(), getConfig: async () => ({ refundTo: 'refund_wallet' }) } })).refunded, false);

  const ride = makeRideModel([paidRide({ serviceType: 'ride' })]);
  assert.equal((await refundGoodsAdvance({ rideId: 'ride1', deps: { Ride: ride, UserWallet: makeWalletModel(), getConfig: async () => ({ refundTo: 'refund_wallet' }) } })).refunded, false);
});

// ---- completion settlement ---------------------------------------------------

test('settlement: driver receives the right total for the full fare', () => {
  // fare 1000, commission 100 (10%), advance 200
  // Cash remainder: driver holds 800 cash, platform owes advance - commission = +100.
  // 800 (cash) + 100 (wallet) = 900 = fare - commission.
  assert.deepEqual(
    computeRideSettlementAmount({ paymentMethod: 'cash', commissionAmount: 100, driverEarnings: 900, advancePaid: 200 }),
    { amount: 100, type: 'ride_earning' },
  );
  // Commission larger than the advance: driver is debited the difference.
  assert.deepEqual(
    computeRideSettlementAmount({ paymentMethod: 'cash', commissionAmount: 300, driverEarnings: 700, advancePaid: 200 }),
    { amount: -100, type: 'commission_deduction' },
  );
  // No advance: unchanged behaviour (commission only).
  assert.deepEqual(
    computeRideSettlementAmount({ paymentMethod: 'cash', commissionAmount: 100, driverEarnings: 900, advancePaid: 0 }),
    { amount: -100, type: 'commission_deduction' },
  );
  // Online: platform collected everything, driver is credited fare - commission.
  assert.deepEqual(
    computeRideSettlementAmount({ paymentMethod: 'online', commissionAmount: 100, driverEarnings: 900, advancePaid: 200 }),
    { amount: 900, type: 'ride_earning' },
  );
});
