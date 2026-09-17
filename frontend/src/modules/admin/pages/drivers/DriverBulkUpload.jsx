import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ChevronRight,
  Download,
  FileText,
  RefreshCw,
  UploadCloud,
  X,
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { DRIVER_IMPORT_COLUMNS, validateDriverImportFile } from './driverImportSchema';

const formatFileSize = (size = 0) => `${(size / (1024 * 1024)).toFixed(2)} MB`;

const DriverBulkUpload = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [dragActive, setDragActive] = useState(false);
  const [files, setFiles] = useState(() => {
    const incomingFile = location.state?.selectedFile;
    return incomingFile ? [incomingFile] : [];
  });
  const [error, setError] = useState('');
  const [replaceIndex, setReplaceIndex] = useState(null);
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
      const validation = await validateDriverImportFile(file);
      if (!validation.valid) {
        setError(validation.message);
        return;
      }
      validatedFiles.push(file);
    }

    setError('');

    if (replaceIndex !== null) {
      setFiles((current) =>
        current.map((currentFile, index) => (index === replaceIndex ? validatedFiles[0] : currentFile)),
      );
      setReplaceIndex(null);
      return;
    }

    setFiles((current) => [...current, ...validatedFiles]);
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

    void addFiles(event.dataTransfer.files);
  };

  const handleFileSelect = (event) => {
    void addFiles(event.target.files);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeFile = (indexToRemove) => {
    setFiles((current) => current.filter((_, index) => index !== indexToRemove));
  };

  const handleDownload = (file) => {
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
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

  return (
    <div className="min-h-screen bg-gray-50 p-6 lg:p-8">
      <div className="mb-6">
        <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-2">
          <span>Drivers</span>
          <ChevronRight size={12} />
          <span className="text-gray-700">Bulk Upload</span>
        </div>

        <div className="flex items-center justify-between gap-4">
          <h1 className="text-xl text-gray-900 font-bold">Bulk Upload</h1>
          <button
            type="button"
            onClick={() => navigate('/admin/drivers')}
            className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <ArrowLeft size={16} /> Back
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex flex-col gap-4 mb-6 pb-4 border-b border-gray-100 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
              <UploadCloud size={18} />
            </div>
            <div>
              <h3 className="text-sm text-gray-900 font-bold">Upload Driver File</h3>
              <p className="text-xs text-gray-400">
                File columns: {DRIVER_IMPORT_COLUMNS.join(', ')}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => navigate('/driver-import/create')}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
          >
            <UploadCloud size={16} /> Select Files
          </button>
        </div>

        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          className={`rounded-lg border transition-colors ${
            dragActive ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 bg-white'
          }`}
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-4 py-3 text-xs font-semibold text-gray-900">File</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-900">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {files.length === 0 ? (
                  <tr>
                    <td colSpan="2" className="px-4 py-14 text-center text-sm font-medium text-gray-400">
                      No files selected. Use Select Files above to create a new upload.
                    </td>
                  </tr>
                ) : (
                  files.map((selectedFile, index) => (
                    <tr key={`${selectedFile.name}-${selectedFile.lastModified}-${index}`} className="hover:bg-gray-50/60 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                            <FileText size={18} />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-gray-900">{selectedFile.name}</p>
                            <p className="mt-0.5 text-xs text-gray-400">{formatFileSize(selectedFile.size)}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handleDownload(selectedFile)}
                            title="Download"
                            className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-indigo-50 hover:text-indigo-600"
                          >
                            <Download size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleReupload(index)}
                            title="Re-upload"
                            className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-emerald-50 hover:text-emerald-600"
                          >
                            <RefreshCw size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeFile(index)}
                            title="Remove"
                            className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-rose-50 hover:text-rose-600"
                          >
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
            Existing import files will appear here with download and re-upload actions.
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
  );
};

export default DriverBulkUpload;
