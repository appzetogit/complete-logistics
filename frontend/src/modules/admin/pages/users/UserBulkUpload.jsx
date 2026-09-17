import React, { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ChevronRight,
  Download,
  FileText,
  Loader2,
  RefreshCw,
  UploadCloud,
  X,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import {
  USER_IMPORT_COLUMNS,
  validateUserImportFile,
} from "./userImportSchema";
import * as XLSX from "xlsx";
import { adminService } from "../../services/adminService";

const formatFileSize = (size = 0) => `${(size / (1024 * 1024)).toFixed(2)} MB`;

const parseCsvLine = (line = "") => {
  const cells = [];
  let current = "";
  let insideQuote = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === '"' && nextChar === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      insideQuote = !insideQuote;
      continue;
    }

    if (char === "," && !insideQuote) {
      cells.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current.trim());
  return cells;
};

const normalizeCsvColumn = (column = "") =>
  String(column || "")
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase();

const parseUsersFromCsv = (text = "") => {
  const rows = String(text || "")
    .split(/\r?\n/)
    .map((row) => row.trim())
    .filter((row) => row.length > 0);

  if (!rows.length) {
    return [];
  }

  const header = parseCsvLine(rows[0]);
  const headerIndex = new Map(
    header.map((column, index) => [normalizeCsvColumn(column), index]),
  );
  const requiredColumns = USER_IMPORT_COLUMNS.map(normalizeCsvColumn);

  const missingColumns = requiredColumns.filter(
    (column) => !headerIndex.has(column),
  );
  if (missingColumns.length) {
    throw new Error(`Missing required columns: ${missingColumns.join(", ")}`);
  }

  const users = [];
  for (let index = 1; index < rows.length; index += 1) {
    const values = parseCsvLine(rows[index]);
    const getValue = (column) =>
      values[headerIndex.get(normalizeCsvColumn(column))] ?? "";

    const name = String(getValue("Name") || "").trim();
    const email = String(getValue("Email") || "").trim();
    const mobile = String(getValue("Mobile") || "").trim();
    const gender = String(getValue("Gender") || "").trim();
    const country = String(getValue("Country") || "").trim();

    if (!name && !mobile && !email) {
      continue;
    }

    users.push({
      name,
      email,
      phone: mobile,
      gender: gender.toLowerCase(),
      countryCode: country,
    });
  }

  return users;
};

const UserBulkUpload = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [dragActive, setDragActive] = useState(false);
  const [files, setFiles] = useState(() => {
    const incomingFile = location.state?.selectedFile;
    return incomingFile ? [incomingFile] : [];
  });
  const [error, setError] = useState("");
  const [replaceIndex, setReplaceIndex] = useState(null);
  const [importingIndex, setImportingIndex] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const incomingFile = location.state?.selectedFile;
    if (!incomingFile) return;

    navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.state, navigate]);

  const addFiles = async (selectedFiles = []) => {
    const nextFiles = Array.from(selectedFiles);
    if (!nextFiles.length) return;

    const validatedFiles = [];
    for (const file of nextFiles) {
      const validation = await validateUserImportFile(file);
      if (!validation.valid) {
        setError(validation.message);
        return;
      }
      validatedFiles.push(file);
    }

    setError("");

    if (replaceIndex !== null) {
      setFiles((current) =>
        current.map((currentFile, index) =>
          index === replaceIndex ? validatedFiles[0] : currentFile,
        ),
      );
      setReplaceIndex(null);
      return;
    }

    setFiles((current) => [...current, ...validatedFiles]);
  };

  const handleDrag = (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (event.type === "dragenter" || event.type === "dragover") {
      setDragActive(true);
      return;
    }

    if (event.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (event) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);

    void addFiles(event.dataTransfer.files);
  };

  const handleFileSelect = (event) => {
    void addFiles(event.target.files);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const removeFile = (indexToRemove) => {
    setFiles((current) =>
      current.filter((_, index) => index !== indexToRemove),
    );
  };

  const handleDownload = (file) => {
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleReupload = (index) => {
    setReplaceIndex(index);
    fileInputRef.current?.click();
  };

  const handleImport = async (selectedFile, index) => {
    if (!selectedFile) return;

    const fileName = selectedFile.name.toLowerCase();
    if (!fileName.endsWith(".csv") && !fileName.endsWith(".xlsx")) {
      toast.error("Only CSV or XLSX import is supported.");
      return;
    }

    try {
      setImportingIndex(index);
      let users = [];

      if (fileName.endsWith(".csv")) {
        const csvText = await selectedFile.text();
        users = parseUsersFromCsv(csvText);
      } else if (fileName.endsWith(".xlsx")) {
        const buffer = await selectedFile.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: "array" });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        if (json.length > 1) {
          const header = json[0];
          const headerIndex = new Map(
            header.map((col, idx) => [normalizeCsvColumn(col), idx]),
          );

          for (let i = 1; i < json.length; i++) {
            const row = json[i];
            if (!row || row.length === 0) continue;

            const getValue = (column) =>
              row[headerIndex.get(normalizeCsvColumn(column))] ?? "";
            const name = String(getValue("Name") || "").trim();
            const email = String(getValue("Email") || "").trim();
            const mobile = String(getValue("Mobile") || "").trim();
            const gender = String(getValue("Gender") || "").trim();
            const country = String(getValue("Country") || "").trim();

            if (!name && !mobile && !email) {
              continue;
            }

            users.push({
              name,
              email,
              phone: mobile,
              gender: gender.toLowerCase(),
              countryCode: country,
            });
          }
        }
      }

      if (!users.length) {
        toast.error("No valid user rows found in this file.");
        return;
      }

      const batchSize = 300;
      let createdCount = 0;
      let skippedCount = 0;
      let errorCount = 0;
      const skippedSample = [];
      const errorSample = [];
      const totalBatches = Math.ceil(users.length / batchSize);
      const toastId = toast.loading(
        `Importing batch 1/${totalBatches} (0/${users.length})...`,
      );

      for (let batchIndex = 0; batchIndex < totalBatches; batchIndex += 1) {
        const start = batchIndex * batchSize;
        const end = Math.min(users.length, start + batchSize);
        const batch = users.slice(start, end);

        toast.loading(
          `Importing batch ${batchIndex + 1}/${totalBatches} (${end}/${users.length})...`,
          { id: toastId },
        );

        const resData = await adminService.bulkImportUsers({ users: batch });

        if (!resData?.success) {
          toast.error(resData?.message || "Import failed", { id: toastId });
          return;
        }

        const summary = resData.data || {};
        createdCount += Number(summary.created_count || 0);
        skippedCount += Number(summary.skipped_count || 0);
        errorCount += Number(summary.error_count || 0);

        if (Array.isArray(summary.skipped) && skippedSample.length < 5) {
          skippedSample.push(
            ...summary.skipped
              .slice(0, 5 - skippedSample.length)
              .map((item) => item?.phone)
              .filter(Boolean),
          );
        }

        if (Array.isArray(summary.errors) && errorSample.length < 5) {
          errorSample.push(
            ...summary.errors
              .slice(0, 5 - errorSample.length)
              .map((item) => item?.message)
              .filter(Boolean),
          );
        }
      }

      if (createdCount === 0) {
        const detailParts = [];
        if (skippedCount) detailParts.push(`skipped ${skippedCount}`);
        if (errorCount) detailParts.push(`errors ${errorCount}`);
        const details = detailParts.length
          ? ` (${detailParts.join(", ")})`
          : "";

        const hintParts = [];
        if (skippedSample.length)
          hintParts.push(`Duplicates: ${skippedSample.join(", ")}`);
        if (errorSample.length)
          hintParts.push(`Errors: ${errorSample.join(" | ")}`);
        const hint = hintParts.length ? `\n${hintParts.join("\n")}` : "";

        toast.error(`No users were created${details}.${hint}`, { id: toastId });
        return;
      }

      toast.success(
        `Imported ${createdCount}, skipped ${skippedCount}, errors ${errorCount}`,
        { id: toastId },
      );
      navigate("/admin/users");
    } catch (err) {
      toast.error(err.message || "Failed to import users");
    } finally {
      setImportingIndex(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 lg:p-6">
      <div className="mb-4">
        <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
          <span>Users</span>
          <ChevronRight size={12} />
          <span className="text-gray-700 font-medium">Bulk Upload</span>
        </div>

        <div className="flex items-center justify-between gap-4">
          <h1 className="text-lg text-gray-900 font-bold">Bulk Upload</h1>
          <button
            type="button"
            onClick={() => navigate("/admin/users")}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-gray-600 bg-white border border-gray-200 rounded-lg shadow-sm hover:bg-gray-50 transition-colors">
            <ArrowLeft size={16} /> Back
          </button>
        </div>
      </div>

      <div>
        <div>
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex flex-col gap-4 mb-6 pb-4 border-b border-gray-100 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
                  <UploadCloud size={18} />
                </div>
                <div>
                  <h3 className="text-sm text-gray-900 font-bold">
                    Upload Customer File
                  </h3>
                  <p className="text-xs text-gray-400">
                    File columns: {USER_IMPORT_COLUMNS.join(", ")}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => navigate("/user-import/create")}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-yellow-400 px-4 py-2 text-sm font-semibold text-black shadow-sm transition-colors hover:bg-yellow-500">
                <UploadCloud size={16} /> Select Files
              </button>
            </div>

            <div
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              className={`rounded-lg border transition-colors ${
                dragActive
                  ? "border-indigo-500 bg-indigo-50"
                  : "border-gray-200 bg-white"
              }`}>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="px-4 py-3 text-xs font-semibold text-gray-900">
                        File
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-900">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {files.length === 0 ? (
                      <tr>
                        <td
                          colSpan="2"
                          className="px-4 py-14 text-center text-sm font-medium text-gray-400">
                          No files selected. Use Select Files above to create a
                          new upload.
                        </td>
                      </tr>
                    ) : (
                      files.map((selectedFile, index) => (
                        <tr
                          key={`${selectedFile.name}-${selectedFile.lastModified}-${index}`}
                          className="hover:bg-gray-50/60 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex min-w-0 items-center gap-3">
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                                <FileText size={18} />
                              </div>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-gray-900">
                                  {selectedFile.name}
                                </p>
                                <p className="mt-0.5 text-xs text-gray-400">
                                  {formatFileSize(selectedFile.size)}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  handleImport(selectedFile, index)
                                }
                                title="Import"
                                disabled={importingIndex !== null}
                                className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-emerald-50 hover:text-emerald-600 disabled:cursor-not-allowed disabled:opacity-60">
                                {importingIndex === index ? (
                                  <Loader2 size={16} className="animate-spin" />
                                ) : (
                                  <UploadCloud size={16} />
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDownload(selectedFile)}
                                title="Download"
                                className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-indigo-50 hover:text-indigo-600">
                                <Download size={16} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleReupload(index)}
                                title="Re-upload"
                                disabled={importingIndex !== null}
                                className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-emerald-50 hover:text-emerald-600">
                                <RefreshCw size={16} />
                              </button>
                              <button
                                type="button"
                                onClick={() => removeFile(index)}
                                title="Remove"
                                disabled={importingIndex !== null}
                                className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-rose-50 hover:text-rose-600">
                                <X size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="border-t border-gray-100 bg-gray-50 px-4 py-3 text-sm text-gray-500">
                Existing import files will appear here with download and
                re-upload actions.
              </div>

              {error && (
                <div className="border-t border-rose-100 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-600">
                  {error}
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".csv,.xlsx"
                multiple={replaceIndex === null}
                onChange={handleFileSelect}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserBulkUpload;
