import React from 'react';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const AdminPageHeader = ({
  module = 'Admin',
  page = '',
  title = '',
  backTo = null,
  right = null,
}) => {
  const navigate = useNavigate();

  return (
    <div className="mb-6">
      <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-2">
        <span>{module}</span>
        <ChevronRight size={12} />
        <span className="text-gray-700">{page || title}</span>
      </div>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl text-gray-900 font-bold">{title || page}</h1>
        <div className="flex items-center gap-2">
          {right}
          {backTo ? (
            <button
              type="button"
              onClick={() => navigate(backTo)}
              className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <ArrowLeft size={16} /> Back
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default AdminPageHeader;

