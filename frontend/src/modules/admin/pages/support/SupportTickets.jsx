import React, { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Filter, Send } from 'lucide-react';
import { adminSupportService } from '../../../shared/services/supportTicketService';

const statusBadgeClass = (status) => {
  if (status === 'closed') return 'bg-emerald-50 text-emerald-600';
  if (status === 'assigned') return 'bg-indigo-50 text-indigo-600';
  return 'bg-amber-50 text-amber-600';
};

const SupportTickets = () => {
  const [stats, setStats] = useState({
    totalTickets: 0,
    pendingTickets: 0,
    assignedTickets: 0,
    closedTickets: 0,
  });
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [userTypeFilter, setUserTypeFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedTicketCode, setSelectedTicketCode] = useState('');
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const [statsResponse, listResponse] = await Promise.all([
        adminSupportService.getTicketStats(),
        adminSupportService.listTickets({
          status: statusFilter,
          userType: userTypeFilter,
          search: search || undefined,
          page: 1,
          limit: 100,
        }),
      ]);
      setStats(statsResponse?.data || {});
      setTickets(listResponse?.data?.results || []);
    } catch (apiError) {
      setError(apiError?.message || 'Unable to load support tickets');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [statusFilter, userTypeFilter]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadData();
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  const selectedListTicket = useMemo(
    () => tickets.find((item) => item.ticketCode === selectedTicketCode) || null,
    [tickets, selectedTicketCode],
  );

  useEffect(() => {
    const ticketCode = selectedListTicket?.ticketCode;
    if (!ticketCode) {
      setSelectedTicket(null);
      return;
    }

    let active = true;
    const loadTicket = async () => {
      try {
        const response = await adminSupportService.getTicket(ticketCode);
        if (!active) return;
        setSelectedTicket(response?.data || null);
      } catch (apiError) {
        if (!active) return;
        setError(apiError?.message || 'Unable to load ticket detail');
      }
    };
    loadTicket();
    return () => {
      active = false;
    };
  }, [selectedListTicket?.ticketCode]);

  const updateTicket = async (payload) => {
    if (!selectedTicketCode) return;
    try {
      await adminSupportService.updateTicket(selectedTicketCode, payload);
      await loadData();
      const detail = await adminSupportService.getTicket(selectedTicketCode);
      setSelectedTicket(detail?.data || null);
    } catch (apiError) {
      setError(apiError?.message || 'Unable to update ticket');
    }
  };

  const handleReply = async () => {
    const message = String(replyText || '').trim();
    if (!message || !selectedTicketCode) return;
    setSending(true);
    setError('');
    try {
      await adminSupportService.replyTicket(selectedTicketCode, { message });
      setReplyText('');
      await loadData();
      const detail = await adminSupportService.getTicket(selectedTicketCode);
      setSelectedTicket(detail?.data || null);
    } catch (apiError) {
      setError(apiError?.message || 'Unable to send reply');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6 lg:p-8">
      <div className="mb-6">
        <div className="mb-2 flex items-center gap-1.5 text-xs text-gray-400">
          <span>Support Management</span>
          <ChevronRight size={12} />
          <span className="text-gray-700">Support Tickets</span>
        </div>
        <h1 className="text-xl text-gray-900 font-bold">Support Tickets</h1>
      </div>

      {error ? (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
          {error}
        </div>
      ) : null}

      <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-semibold text-gray-500">Total Tickets</p>
          <p className="mt-2 text-2xl font-semibold text-gray-900">{stats.totalTickets || 0}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-semibold text-gray-500">Pending Tickets</p>
          <p className="mt-2 text-2xl font-semibold text-amber-600">{stats.pendingTickets || 0}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-semibold text-gray-500">Assigned Tickets</p>
          <p className="mt-2 text-2xl font-semibold text-indigo-600">{stats.assignedTickets || 0}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-semibold text-gray-500">Closed Tickets</p>
          <p className="mt-2 text-2xl font-semibold text-emerald-600">{stats.closedTickets || 0}</p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <div className="rounded-xl border border-gray-200 bg-white">
          <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 p-4">
            <div className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-500">
              <Filter size={15} />
              <span>Filters</span>
            </div>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            >
              <option value="all">All status</option>
              <option value="pending">Pending</option>
              <option value="assigned">Assigned</option>
              <option value="closed">Closed</option>
            </select>
            <select
              value={userTypeFilter}
              onChange={(event) => setUserTypeFilter(event.target.value)}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            >
              <option value="all">All user types</option>
              <option value="user">User</option>
              <option value="driver">Driver</option>
              <option value="owner">Owner</option>
            </select>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search ticket..."
              className="min-w-[220px] flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Ticket ID</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Title</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">User</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500">Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-sm text-gray-400">
                      Loading support tickets...
                    </td>
                  </tr>
                ) : tickets.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-sm text-gray-400">
                      No support ticket found.
                    </td>
                  </tr>
                ) : (
                  tickets.map((ticket) => (
                    <tr key={ticket.id} className="border-b border-gray-50 last:border-b-0">
                      <td className="px-4 py-3 text-xs font-semibold text-gray-700">{ticket.ticketCode}</td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{ticket.title}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        <p className="font-medium text-gray-800">{ticket.requesterName}</p>
                        <p className="text-xs text-gray-500">{ticket.userType}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusBadgeClass(ticket.status)}`}>
                          {ticket.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedTicketCode(ticket.ticketCode)}
                          className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5">
          {!selectedTicket ? (
            <div className="flex min-h-[300px] items-center justify-center rounded-lg border border-dashed border-gray-200 text-sm text-gray-400">
              Select ticket to view detail
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {selectedTicket.ticketCode}
                </p>
                <h3 className="mt-1 text-lg text-gray-900 font-bold">{selectedTicket.title}</h3>
                <p className="mt-1 text-sm text-gray-500">
                  {selectedTicket.requesterName} • {selectedTicket.requesterPhone || 'N/A'} •{' '}
                  {selectedTicket.userType}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => updateTicket({ assignToMe: true })}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Assign To Me
                </button>
                <button
                  type="button"
                  onClick={() => updateTicket({ status: 'closed' })}
                  className="rounded-lg border border-emerald-200 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
                >
                  Mark Closed
                </button>
              </div>

              <div className="max-h-72 space-y-3 overflow-y-auto rounded-lg border border-gray-100 bg-gray-50 p-3">
                {(selectedTicket.messages || []).map((message) => (
                  <div key={message.id} className="rounded-lg border border-gray-100 bg-white p-3">
                    <p className="text-xs font-semibold uppercase text-gray-500">
                      {message.senderRole} • {message.senderName}
                    </p>
                    <p className="mt-1 text-sm text-gray-800">{message.message}</p>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <textarea
                  rows={3}
                  value={replyText}
                  onChange={(event) => setReplyText(event.target.value)}
                  placeholder="Write reply..."
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
                <button
                  type="button"
                  onClick={handleReply}
                  disabled={sending || !replyText.trim()}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Send size={15} />
                  {sending ? 'Sending...' : 'Send Reply'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SupportTickets;
