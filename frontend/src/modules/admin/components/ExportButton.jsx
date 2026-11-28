import React, { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

// One Export button for every admin list. It downloads a CSV (opens in Excel).
//
// Two ways to give it data:
//  1. getRows + columns: an async function that returns ALL matching rows (every page, current filters)
//     and the columns to write: [{ label: 'Name', value: (row) => row.name }].
//  2. tableRef: a ref to the page's <table>. The rows shown in the table are exported as they look on screen.
//     Columns named "Action" / "Actions" are left out.

const SKIP_HEADERS = new Set(['action', 'actions', '']);

const toCell = (value) => {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : value.toISOString();
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

const escapeCsv = (value) => {
  const text = toCell(value).replace(/\r?\n/g, ' ').trim();
  // Stop Excel from running a cell as a formula (CSV injection).
  const safe = /^[=+\-@]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text) ? `'${text}` : text;
  return /[",]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

const downloadCsv = (filename, header, rows) => {
  const lines = [header, ...rows].map((row) => row.map(escapeCsv).join(','));
  // BOM so Excel reads ₹ and Hindi names correctly.
  const blob = new Blob([`﻿${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `${String(filename || 'export').replace(/[^\w-]+/g, '_')}_${stamp}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const readTable = (table) => {
  const headerCells = [...(table.querySelector('thead tr')?.children || [])];
  const headers = headerCells.map((cell) => cell.innerText.trim());
  const keep = headers.map((label) => !SKIP_HEADERS.has(label.toLowerCase()));
  const rows = [...table.querySelectorAll('tbody tr')]
    .map((tr) => [...tr.children])
    // skip "no data" / loading rows that span the whole table
    .filter((cells) => cells.length === headers.length || headers.length === 0)
    .map((cells) => cells.filter((_, index) => keep[index] !== false).map((cell) => cell.innerText.replace(/\s*\n\s*/g, ' ').trim()));
  return { header: headers.filter((_, index) => keep[index]), rows };
};

const ExportButton = ({ filename = 'export', getRows, columns, tableRef, className = '', label = 'Export' }) => {
  const [busy, setBusy] = useState(false);

  const handleExport = async () => {
    if (busy) return;
    setBusy(true);
    try {
      let header = [];
      let rows = [];
      if (typeof getRows === 'function' && Array.isArray(columns)) {
        const data = await getRows();
        header = columns.map((column) => column.label);
        rows = (Array.isArray(data) ? data : []).map((row) => columns.map((column) => column.value(row)));
      } else if (tableRef?.current) {
        ({ header, rows } = readTable(tableRef.current));
      }
      if (!rows.length) {
        toast.error('Nothing to export');
        return;
      }
      downloadCsv(filename, header, rows);
      toast.success(`Exported ${rows.length} rows`);
    } catch (error) {
      toast.error(error?.message || 'Export failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={busy}
      className={
        className
        || 'flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg shadow-sm hover:bg-gray-50 transition-colors disabled:opacity-60'
      }
    >
      {busy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} {label}
    </button>
  );
};

// Fetches every page of a paginated admin list. `fetchPage(page, limit)` returns the API response;
// `pick(response)` returns { results, lastPage }.
export const fetchAllPages = async (fetchPage, pick, { limit = 200, maxPages = 100 } = {}) => {
  const all = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const response = await fetchPage(page, limit);
    const { results = [], lastPage = 1 } = pick(response) || {};
    all.push(...results);
    if (!results.length || page >= Number(lastPage || 1)) break;
  }
  return all;
};

export default ExportButton;
