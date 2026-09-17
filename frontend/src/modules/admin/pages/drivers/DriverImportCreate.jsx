import React, { useRef, useState } from 'react';
import { ArrowLeft, ChevronRight, FileText, UploadCloud, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { adminService } from '../../services/adminService';
import {
  DRIVER_IMPORT_COLUMNS,
  parseDriverImportFile,
  validateDriverImportFile,
} from './driverImportSchema';

const labelClass = 'block text-xs font-semibold text-gray-500 mb-1.5';

const formatFileSize = (size = 0) => `${(size / (1024 * 1024)).toFixed(2)} MB`;

const DriverImportCreate = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const goBack = () => navigate('/admin/drivers/bulk-upload');

  const selectFile = async (file) => {
    if (!file) return;

    const validation = await validateDriverImportFile(file);
    if (!validation.valid) {
      setError(validation.message);
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);
    setError('');
  };

  const handleFileInput = (event) => {
    void selectFile(event.target.files?.[0]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDrag = (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (event.type === 'dragenter' || event.type === 'dragover') {
      setDragActive(true);
      return;
    }

    if (event.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (event) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
    void selectFile(event.dataTransfer.files?.[0]);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!selectedFile) {
      setError('Select a file before creating the import.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError('');

      const parsed = await parseDriverImportFile(selectedFile);
      if (!parsed.valid) {
        setError(parsed.message);
        return;
      }

      const response = await adminService.bulkImportDrivers({ drivers: parsed.rows });
      const result = response.data || {};
      const summary = `Imported ${result.created_count || 0} drivers. Skipped ${result.skipped_count || 0}, errors ${result.error_count || 0}.`;

      if ((result.created_count || 0) > 0) {
        toast.success(summary);
        navigate('/admin/drivers');
        return;
      }

      setError(summary);
    } catch (importError) {
      setError(importError.message || 'Failed to import drivers.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6 lg:p-8">
      <div className="mb-6">
        <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-2">
          <span>Drivers</span>
          <ChevronRight size={12} />
          <span>Bulk Upload</span>
          <ChevronRight size={12} />
          <span className="text-gray-700">Create Import</span>
        </div>

        <div className="flex items-center justify-between gap-4">
          <h1 className="text-xl text-gray-900 font-bold">Create Import</h1>
          <button
            type="button"
            onClick={goBack}
            className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <ArrowLeft size={16} /> Back
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100">
            <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
              <UploadCloud size={18} />
            </div>
            <div>
              <h3 className="text-sm text-gray-900 font-bold">Driver Import File</h3>
              <p className="text-xs text-gray-400">
                Use only these columns: {DRIVER_IMPORT_COLUMNS.join(', ')}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5">
            <div>
              <label className={labelClass}>Import File *</label>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                className={`flex min-h-[220px] w-full flex-col items-center justify-center rounded-lg border border-dashed px-6 py-8 text-center transition-colors ${
                  dragActive
                    ? 'border-indigo-500 bg-indigo-50'
                    : 'border-gray-200 bg-gray-50 hover:border-indigo-300 hover:bg-white'
                }`}
              >
                <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-white text-indigo-600 border border-gray-200">
                  <UploadCloud size={22} />
                </span>
                <span className="text-sm font-semibold text-gray-900">
                  {selectedFile ? 'Replace selected file' : 'Select file'}
                </span>
                <span className="mt-1 text-xs text-gray-500">
                  CSV or XLSX files only, with no extra columns
                </span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx"
                className="hidden"
                onChange={handleFileInput}
              />
            </div>

            {selectedFile && (
              <div className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 bg-white px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                    <FileText size={18} />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-900">{selectedFile.name}</p>
                    <p className="mt-0.5 text-xs text-gray-400">{formatFileSize(selectedFile.size)}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedFile(null);
                    setError('');
                  }}
                  className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-rose-50 hover:text-rose-600"
                  title="Remove"
                >
                  <X size={16} />
                </button>
              </div>
            )}

            <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
              <p className="text-xs font-semibold text-gray-500 mb-2">Required Excel Columns</p>
              <div className="flex flex-wrap gap-2">
                {DRIVER_IMPORT_COLUMNS.map((column) => (
                  <span
                    key={column}
                    className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-800"
                  >
                    {column}
                  </span>
                ))}
              </div>
            </div>

            {error && (
              <div className="rounded-lg border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-600">
                {error}
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3 self-start">
          <button
            type="submit"
            className="w-full py-3 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors disabled:cursor-not-allowed disabled:bg-indigo-200"
            disabled={!selectedFile || isSubmitting}
          >
            {isSubmitting ? 'Importing...' : 'Create Import'}
          </button>
          <button
            type="button"
            onClick={goBack}
            className="w-full py-3 bg-gray-50 text-gray-600 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-100 transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};

export default DriverImportCreate;
