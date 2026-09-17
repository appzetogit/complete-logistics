import React, { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  FileSearch,
  Loader2,
  Menu,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import AdminPageHeader from "../../components/ui/AdminPageHeader";

const BASE = `${globalThis.__LEGACY_BACKEND_ORIGIN__}/api/v1/admin`;

const getOwnerName = (owner) =>
  owner?.name || owner?.user_id?.name || owner?.company_name || "-";
const getOwnerEmail = (owner) => owner?.email || owner?.user_id?.email || "-";
const getOwnerMobile = (owner) =>
  owner?.mobile || owner?.user_id?.mobile || "-";

const DeletedOwners = () => {
  const navigate = useNavigate();
  const token = localStorage.getItem("adminToken") || "";

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [owners, setOwners] = useState([]);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [page, setPage] = useState(1);

  useEffect(() => setPage(1), [itemsPerPage]);

  const fetchDeletedOwners = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${BASE}/owners/deleted?page=1&limit=200`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const json = await res.json();
      if (json?.success) {
        const list = json?.data?.results || json?.data || [];
        setOwners(Array.isArray(list) ? list : []);
      }
    } catch (e) {
      console.error("Fetch deleted owners error:", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDeletedOwners();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRestore = async (id) => {
    if (!window.confirm("Restore this owner account?")) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`${BASE}/owners/deleted/${id}/restore`, {
        method: "PATCH",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const json = await res.json();
      if (json?.success) fetchDeletedOwners();
      else alert(json?.message || "Restore failed");
    } catch (e) {
      console.error("Restore owner failed:", e);
      alert("Restore failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePermanentDelete = async (id) => {
    if (!window.confirm("PERMANENT DELETE? This cannot be undone.")) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`${BASE}/owners/deleted/${id}`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const json = await res.json();
      if (json?.success) fetchDeletedOwners();
      else alert(json?.message || "Delete failed");
    } catch (e) {
      console.error("Permanent delete failed:", e);
      alert("Delete failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  const totalEntries = owners.length;
  const totalPages = Math.max(1, Math.ceil(totalEntries / itemsPerPage));
  const safePage = Math.min(page, totalPages);
  const pagedOwners = useMemo(() => {
    const start = (safePage - 1) * itemsPerPage;
    return owners.slice(start, start + itemsPerPage);
  }, [owners, safePage, itemsPerPage]);
  const showingFrom =
    totalEntries === 0 ? 0 : (safePage - 1) * itemsPerPage + 1;
  const showingTo =
    totalEntries === 0
      ? 0
      : Math.min(showingFrom + pagedOwners.length - 1, totalEntries);

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-950">
      <div className="p-6 lg:p-8">
        <AdminPageHeader
          module="Owner Management"
          page="Deleted Owners"
          title="Deleted Owners"
          backTo="/admin/owners"
        />

        <div className="mt-6">
          <div className="px-5 pb-6">
            <div className="relative rounded border border-gray-200 bg-white shadow-sm">
              <div className="flex flex-col gap-5 px-5 py-5 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-3 text-sm font-semibold text-slate-400">
                  <span>show</span>
                  <div className="relative">
                    <select
                      value={itemsPerPage}
                      onChange={(event) =>
                        setItemsPerPage(Number(event.target.value) || 10)
                      }
                      className="h-9 w-24 appearance-none rounded border border-gray-300 bg-white px-3 text-sm text-gray-950 outline-none transition-colors focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500">
                      {[10, 25, 50, 100].map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      size={16}
                      className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-700"
                    />
                  </div>
                  <span>entries</span>
                </div>
              </div>

              <div className="px-5">
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-4 text-sm font-bold text-gray-950">
                          Name
                        </th>
                        <th className="px-3 py-4 text-sm font-bold text-gray-950">
                          Email
                        </th>
                        <th className="px-3 py-4 text-sm font-bold text-gray-950">
                          Mobile Number
                        </th>
                        <th className="px-3 py-4 text-sm font-bold text-gray-950">
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {isLoading ? (
                        <tr>
                          <td colSpan="4" className="px-3 py-24 text-center">
                            <div className="flex flex-col items-center gap-4 text-slate-400">
                              <Loader2
                                size={34}
                                className="animate-spin text-teal-500"
                              />
                              <p className="text-sm font-semibold">
                                Loading deleted owners...
                              </p>
                            </div>
                          </td>
                        </tr>
                      ) : pagedOwners.length === 0 ? (
                        <tr>
                          <td
                            colSpan="4"
                            className="border-b border-gray-200 px-3 py-12 text-center">
                            <div className="flex min-h-[130px] flex-col items-center justify-center text-slate-700">
                              <FileSearch
                                size={92}
                                strokeWidth={1.7}
                                className="mb-2 text-indigo-950"
                              />
                              <p className="text-xl font-medium">
                                No Data Found
                              </p>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        pagedOwners.map((owner) => (
                          <tr
                            key={owner._id}
                            className="bg-white transition-colors hover:bg-gray-50">
                            <td className="px-3 py-5 text-sm text-gray-950">
                              {getOwnerName(owner)}
                            </td>
                            <td className="px-3 py-5 text-sm text-gray-950">
                              {getOwnerEmail(owner)}
                            </td>
                            <td className="px-3 py-5 text-sm text-gray-950">
                              {getOwnerMobile(owner)}
                            </td>
                            <td className="px-3 py-5">
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleRestore(owner._id)}
                                  disabled={isSubmitting}
                                  className="inline-flex h-9 items-center gap-2 rounded bg-emerald-50 px-4 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                                  title="Restore">
                                  <RotateCcw size={16} />
                                  Restore
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handlePermanentDelete(owner._id)
                                  }
                                  disabled={isSubmitting}
                                  className="inline-flex h-9 w-10 items-center justify-center rounded bg-rose-50 text-rose-600 transition-colors hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                                  title="Delete permanently">
                                  <Trash2 size={16} />
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
            </div>

            <div className="mt-8 flex items-center justify-between">
              <p className="text-sm font-medium text-slate-400">
                Showing {showingFrom} to {showingTo} of {totalEntries} entries
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={safePage <= 1}
                  className="rounded border border-gray-200 bg-white px-4 py-2 text-sm text-slate-500 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60">
                  Prev
                </button>
                <button
                  type="button"
                  className="rounded bg-indigo-950 px-4 py-2 text-sm font-semibold text-white">
                  {safePage}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setPage((current) => Math.min(totalPages, current + 1))
                  }
                  disabled={safePage >= totalPages}
                  className="rounded border border-gray-200 bg-white px-4 py-2 text-sm text-slate-500 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60">
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeletedOwners;
