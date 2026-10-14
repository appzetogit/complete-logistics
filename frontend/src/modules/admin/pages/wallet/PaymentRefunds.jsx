import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, RotateCcw } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { adminService } from '../../services/adminService';

// Rider payments the app refunded automatically (the ride was already paid, wrong amount...).
// "Needs attention": Razorpay rejected the refund (or it got stuck), so the rider has not got the money back.

const FILTERS = [
  { id: 'attention', label: 'Needs attention' },
  { id: 'processed', label: 'Refunded' },
  { id: 'resolved_manually', label: 'Done by hand' },
  { id: 'all', label: 'All' },
];

const STATUS_STYLES = {
  failed: 'bg-red-50 text-red-700 border-red-200',
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  processed: 'bg-green-50 text-green-700 border-green-200',
  resolved_manually: 'bg-gray-50 text-gray-700 border-gray-200',
};

const STATUS_LABELS = {
  failed: 'Failed',
  pending: 'Stuck',
  processed: 'Refunded',
  resolved_manually: 'Done by hand',
};

const REASON_LABELS = {
  ride_already_paid: 'Ride was already paid',
  amount_mismatch: 'Wrong amount',
  not_payable: 'Ride could not be paid',
};

const formatDateTime = (value) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '--';
  return date.toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
};

const PaymentRefunds = () => {
  const [filter, setFilter] = useState('attention');
  const [rows, setRows] = useState([]);
  const [attentionCount, setAttentionCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await adminService.getRidePaymentRefunds(filter);
      const data = response?.data?.data || response?.data || {};
      setRows(Array.isArray(data.results) ? data.results : []);
      setAttentionCount(Number(data.attentionCount || 0));
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Could not load refunds');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const retry = async (row) => {
    const key = `${row.rideId}:${row.paymentId}`;
    setBusyKey(key);
    try {
      const response = await adminService.retryRidePaymentRefund(row.rideId, row.paymentId);
      const result = response?.data || {};
      if (result.success) toast.success('Refund sent to Razorpay');
      else toast.error(result.message || 'Razorpay rejected the refund again');
      await load();
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Could not retry the refund');
    } finally {
      setBusyKey('');
    }
  };

  const markDone = async (row) => {
    const note = window.prompt('How was the money returned? (e.g. bank transfer, Razorpay dashboard)', '');
    if (note === null) return;
    const key = `${row.rideId}:${row.paymentId}`;
    setBusyKey(key);
    try {
      await adminService.resolveRidePaymentRefund(row.rideId, row.paymentId, note);
      toast.success('Marked as refunded');
      await load();
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Could not update the refund');
    } finally {
      setBusyKey('');
    }
  };

  const canAct = (row) => row.status === 'failed' || row.status === 'pending';

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Payment Refunds</h1>
          <p className="text-sm text-gray-500">
            Rider payments refunded automatically because the ride was already paid. Failed ones need you: retry, or
            return the money another way and mark it done.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          <RefreshCw size={16} /> Refresh
        </button>
      </div>

      {attentionCount > 0 ? (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          <AlertTriangle size={18} />
          {attentionCount} refund{attentionCount === 1 ? '' : 's'} need{attentionCount === 1 ? 's' : ''} attention: the rider
          has not got the money back yet.
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setFilter(item.id)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
              filter === item.id ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-200 bg-white text-gray-600'
            }`}
          >
            {item.label}
            {item.id === 'attention' && attentionCount > 0 ? ` (${attentionCount})` : ''}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Rider</th>
              <th className="px-4 py-3">Ride</th>
              <th className="px-4 py-3">Payment</th>
              <th className="px-4 py-3 text-right">Amount</th>
              <th className="px-4 py-3">Reason</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-gray-400">
                  <Loader2 className="mx-auto animate-spin" size={20} />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-gray-500">
                  <CheckCircle2 className="mx-auto mb-2 text-green-500" size={22} />
                  {filter === 'attention' ? 'No refund needs attention.' : 'No refunds.'}
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const key = `${row.rideId}:${row.paymentId}`;
                return (
                  <tr key={key} className="align-top">
                    <td className="px-4 py-3 whitespace-nowrap text-gray-600">{formatDateTime(row.updatedAt || row.at)}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{row.riderName || '--'}</div>
                      <div className="text-xs text-gray-500">{row.riderPhone}</div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">{row.rideId.slice(-8)}</td>
                    <td className="px-4 py-3">
                      <div className="font-mono text-xs text-gray-700">{row.paymentId}</div>
                      {row.refundId ? <div className="font-mono text-xs text-gray-400">{row.refundId}</div> : null}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">&#8377;{Number(row.amount || 0).toFixed(2)}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {REASON_LABELS[row.reason] || row.reason || '--'}
                      {row.error ? <div className="mt-1 text-xs text-red-600">{row.error}</div> : null}
                      {row.note ? <div className="mt-1 text-xs text-gray-500">{row.note}</div> : null}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${STATUS_STYLES[row.status] || STATUS_STYLES.resolved_manually}`}>
                        {STATUS_LABELS[row.status] || row.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right">
                      {canAct(row) ? (
                        <div className="inline-flex gap-2">
                          <button
                            type="button"
                            disabled={busyKey === key}
                            onClick={() => retry(row)}
                            className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                          >
                            {busyKey === key ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />} Retry
                          </button>
                          <button
                            type="button"
                            disabled={busyKey === key}
                            onClick={() => markDone(row)}
                            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 disabled:opacity-50"
                          >
                            Mark refunded
                          </button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default PaymentRefunds;
