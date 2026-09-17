import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import OwnerFormPanel from './OwnerFormPanel';
import { adminService } from '../../services/adminService';

const initialFormData = {
  company_name: '',
  name: '',
  mobile: '',
  email: '',
  password: '',
  password_confirmation: '',
  service_location_id: '',
  transport_type: '',
};

const defaultTransportTypes = [
  { transport_type: 'all' },
  { transport_type: 'taxi' },
  { transport_type: 'delivery' },
  { transport_type: 'intercity' },
];

const OwnerCreate = () => {
  const navigate = useNavigate();
  const [areas, setAreas] = useState([]);
  const [transportTypes, setTransportTypes] = useState(defaultTransportTypes);
  const [formData, setFormData] = useState(initialFormData);
  const [isLoading, setIsLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const fetchFormOptions = async () => {
      setIsLoading(true);
      try {
        const [locationsResponse, modulesResponse] = await Promise.all([
          adminService.getServiceLocations(),
          adminService.getRideModules(),
        ]);

        if (locationsResponse.success) {
          const locations = Array.isArray(locationsResponse.data)
            ? locationsResponse.data
            : locationsResponse.data?.results || [];
          setAreas(locations);
        }

        if (modulesResponse.success) {
          const rawModules = modulesResponse.data;
          const mappedModules = Array.isArray(rawModules)
            ? rawModules
            : Object.keys(rawModules || {}).map((key) => ({ transport_type: key }));

          if (mappedModules.length > 0) {
            setTransportTypes(mappedModules);
          }
        }
      } catch (error) {
        console.error('Owner form setup failed:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchFormOptions();
  }, []);

  const handleSave = async (event) => {
    event.preventDefault();

    if (formData.password !== formData.password_confirmation) {
      alert('Passwords do not match');
      return;
    }

    setSubmitting(true);
    try {
      const response = await adminService.createOwner(formData);

      if (response.success) {
        navigate('/admin/owners');
        return;
      }

      alert(response.message || 'Failed to create owner');
    } catch (error) {
      alert(error.message || 'Operation failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-slate-500">
          <Loader2 size={32} className="animate-spin text-yellow-500" />
          <p className="text-sm font-bold">Preparing Owner Form...</p>
        </div>
      </div>
    );
  }

  return (
    <OwnerFormPanel
      mode="create"
      formData={formData}
      setFormData={setFormData}
      areas={areas}
      transportTypes={transportTypes}
      submitting={submitting}
      onSubmit={handleSave}
      onCancel={() => navigate('/admin/owners')}
    />
  );
};

export default OwnerCreate;
