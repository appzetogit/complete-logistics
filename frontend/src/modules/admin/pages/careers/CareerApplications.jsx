import React, { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Eye, Briefcase, Mail, Phone, Calendar, Clock, Download, ExternalLink, Trash2 } from 'lucide-react';
import api from '../../../../shared/api/axiosInstance';
import toast from 'react-hot-toast';

const STATUS_OPTIONS = ['pending', 'reviewed', 'shortlisted', 'rejected'];

const CareerApplications = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedApp, setSelectedApp] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const loadRows = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/admin/careers/applications');
      const results = res?.results || res?.data?.results || [];
      setRows(results);
    } catch (apiError) {
      setError(apiError?.message || 'Unable to load applications');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRows();
  }, []);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const matchesSearch = [row.fullName, row.email, row.phone, row.jobTitle, row.jobDepartment].some((val) =>
        String(val || '').toLowerCase().includes(search.trim().toLowerCase())
      );
      const matchesStatus = statusFilter === 'all' || row.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [rows, search, statusFilter]);

  const updateStatus = async (appId, nextStatus) => {
    try {
      await api.patch(`/admin/careers/applications/${appId}/status`, { status: nextStatus });
      toast.success(`Application status updated to ${nextStatus}`);
      if (selectedApp?.id === appId) {
        setSelectedApp((prev) => ({ ...prev, status: nextStatus }));
      }
      await loadRows();
    } catch (apiError) {
      toast.error(apiError?.message || 'Failed to update status');
    }
  };

  const deleteApplication = async (appId) => {
    if (!window.confirm('Are you sure you want to permanently delete this application?')) return;
    try {
      await api.delete(`/admin/careers/applications/${appId}`);
      toast.success('Application deleted successfully');
      if (selectedApp?.id === appId) {
        setSelectedApp(null);
      }
      await loadRows();
    } catch (apiError) {
      toast.error(apiError?.message || 'Failed to delete application');
    }
  };


  return (
    <div className="min-h-screen bg-gray-50 p-6 lg:p-8">
      <div className="mb-6">
        <div className="mb-2 flex items-center gap-1.5 text-xs text-gray-400 font-semibold">
          <span>Careers Management</span>
          <ChevronRight size={12} />
          <span className="text-gray-700">Applications</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-xl font-bold text-gray-900 uppercase tracking-tight">Applications Received</h1>
        </div>
      </div>

      {error ? (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600 font-medium">
          {error}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        {/* Applications List */}
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden h-fit">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-100 p-4">
            <div className="flex items-center gap-3">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-bold uppercase tracking-wider text-slate-700 bg-white"
              >
                <option value="all">All Statuses</option>
                {STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </div>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search applications..."
              className="w-60 rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none transition-colors focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-6 py-3.5 text-left text-xs font-bold uppercase tracking-wider text-gray-500">Applicant</th>
                  <th className="px-6 py-3.5 text-left text-xs font-bold uppercase tracking-wider text-gray-500">Position</th>
                  <th className="px-6 py-3.5 text-left text-xs font-bold uppercase tracking-wider text-gray-500">Experience</th>
                  <th className="px-6 py-3.5 text-left text-xs font-bold uppercase tracking-wider text-gray-500">Applied On</th>
                  <th className="px-6 py-3.5 text-left text-xs font-bold uppercase tracking-wider text-gray-500">Status</th>
                  <th className="px-6 py-3.5 text-right text-xs font-bold uppercase tracking-wider text-gray-500">Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-10 text-center text-sm text-gray-400 font-medium">
                      Loading applications...
                    </td>
                  </tr>
                ) : filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-10 text-center text-sm text-gray-400 font-medium">
                      No applications found.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row) => (
                    <tr
                      key={row.id}
                      className={`border-b border-gray-50 last:border-b-0 hover:bg-gray-50/50 cursor-pointer ${
                        selectedApp?.id === row.id ? 'bg-amber-50/20' : ''
                      }`}
                      onClick={() => setSelectedApp(row)}
                    >
                      <td className="px-6 py-4">
                        <div className="font-bold text-gray-900">{row.fullName}</div>
                        <div className="text-xs font-medium text-gray-400 mt-0.5">{row.email}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-bold text-slate-800">{row.jobTitle}</div>
                        <div className="text-xs font-semibold text-gray-400 mt-0.5">{row.jobDepartment}</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600 font-semibold">{row.experience} Year(s)</td>
                      <td className="px-6 py-4 text-sm text-gray-500 font-semibold">
                        {new Date(row.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${
                            row.status === 'shortlisted'
                              ? 'bg-emerald-50 text-emerald-600'
                              : row.status === 'rejected'
                              ? 'bg-rose-50 text-rose-600'
                              : row.status === 'reviewed'
                              ? 'bg-blue-50 text-blue-600'
                              : 'bg-amber-50 text-[#FFB300]'
                          }`}
                        >
                          {row.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedApp(row);
                            }}
                            className="rounded-md border border-gray-200 p-2 text-gray-500 hover:bg-gray-50"
                            title="View Details"
                          >
                            <Eye size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteApplication(row.id);
                            }}
                            className="rounded-md border border-red-100 p-2 text-red-500 hover:bg-red-50"
                            title="Delete Application"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Selected Application Details Panel */}
        <div>
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm sticky top-24">
            {selectedApp ? (
              <div>
                <div className="mb-5 border-b border-gray-100 pb-4">
                  <span
                    className={`inline-block rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider mb-2 ${
                      selectedApp.status === 'shortlisted'
                        ? 'bg-emerald-50 text-emerald-600'
                        : selectedApp.status === 'rejected'
                        ? 'bg-rose-50 text-rose-600'
                        : selectedApp.status === 'reviewed'
                        ? 'bg-blue-50 text-blue-600'
                        : 'bg-amber-50 text-[#FFB300]'
                    }`}
                  >
                    {selectedApp.status}
                  </span>
                  <h3 className="text-lg font-bold text-gray-900 leading-tight">{selectedApp.fullName}</h3>
                  <p className="text-xs font-semibold text-gray-400 mt-1">
                    Applied for: {selectedApp.jobTitle} ({selectedApp.jobDepartment})
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div>
                      <span className="block font-bold text-gray-400 uppercase tracking-wider mb-1">Email</span>
                      <a
                        href={`mailto:${selectedApp.email}`}
                        className="font-semibold text-indigo-600 hover:underline flex items-center gap-1"
                      >
                        <Mail size={12} />
                        {selectedApp.email}
                      </a>
                    </div>
                    <div>
                      <span className="block font-bold text-gray-400 uppercase tracking-wider mb-1">Phone</span>
                      <a
                        href={`tel:${selectedApp.phone}`}
                        className="font-semibold text-slate-800 hover:underline flex items-center gap-1"
                      >
                        <Phone size={12} />
                        {selectedApp.phone}
                      </a>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-xs border-t border-gray-50 pt-3">
                    <div>
                      <span className="block font-bold text-gray-400 uppercase tracking-wider mb-1">Experience</span>
                      <span className="font-bold text-slate-800">{selectedApp.experience} Year(s)</span>
                    </div>
                    <div>
                      <span className="block font-bold text-gray-400 uppercase tracking-wider mb-1">Applied Date</span>
                      <span className="font-semibold text-gray-500">
                        {new Date(selectedApp.createdAt).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {selectedApp.resumeUrl && (
                    <div className="border-t border-gray-50 pt-3 text-xs">
                      <span className="block font-bold text-gray-400 uppercase tracking-wider mb-1.5">Resume / Portfolio Link</span>
                      <a
                        href={selectedApp.resumeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 bg-[#FFB300]/10 hover:bg-[#FFB300]/20 text-slate-800 px-3 py-1.5 rounded-xl font-bold transition-colors"
                      >
                        <ExternalLink size={12} />
                        <span>View Portfolio / Resume</span>
                      </a>
                    </div>
                  )}

                  <div className="border-t border-gray-50 pt-3 text-xs">
                    <span className="block font-bold text-gray-400 uppercase tracking-wider mb-1.5">Cover Letter</span>
                    <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 text-gray-600 leading-relaxed whitespace-pre-line max-h-48 overflow-y-auto">
                      {selectedApp.coverLetter || 'No cover letter submitted.'}
                    </div>
                  </div>

                  <div className="border-t border-gray-100 pt-4 mt-6">
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2.5">
                      Update Application Status
                    </span>
                    <div className="grid grid-cols-3 gap-2">
                      {STATUS_OPTIONS.filter((s) => s !== 'pending').map((status) => (
                        <button
                          key={status}
                          type="button"
                          onClick={() => updateStatus(selectedApp.id, status)}
                          className={`py-2 text-[10px] font-bold uppercase tracking-wider rounded-lg border transition-all ${
                            selectedApp.status === status
                              ? status === 'shortlisted'
                                ? 'bg-emerald-500 border-emerald-500 text-white shadow-md shadow-emerald-500/10'
                                : status === 'rejected'
                                ? 'bg-rose-500 border-rose-500 text-white shadow-md shadow-rose-500/10'
                                : 'bg-blue-500 border-blue-500 text-white shadow-md shadow-blue-500/10'
                              : 'border-gray-200 hover:border-slate-800 text-gray-600'
                          }`}
                        >
                          {status}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="border-t border-red-100 pt-4 mt-6">
                    <button
                      type="button"
                      onClick={() => deleteApplication(selectedApp.id)}
                      className="w-full py-2.5 text-xs font-bold uppercase tracking-wider rounded-lg border border-red-200 hover:bg-red-50 text-red-600 flex items-center justify-center gap-1.5 transition-all font-semibold"
                    >
                      <Trash2 size={14} />
                      <span>Delete Application</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-12">
                <Briefcase size={36} className="mx-auto text-gray-300 mb-3" />
                <p className="text-sm font-semibold text-gray-500">
                  Select an application from the table to view applicant details, portfolio link, and update application status.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CareerApplications;
