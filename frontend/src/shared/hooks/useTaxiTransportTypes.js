import { useState, useEffect } from 'react';
import api from '../api/axiosInstance';

export const useTaxiTransportTypes = ({ enabled = true } = {}) => {
  const [transportTypes, setTransportTypes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    const fetchTypes = async () => {
      setLoading(true);
      try {
        const res = await api.get('/admin/types/transport-types');
        // Handle both direct return and success payload
        const data = res.data || res.results || res;
        setTransportTypes(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error('Failed to fetch transport types:', err);
        setError(err);
        // Fallback to defaults to prevent UI breakage
        setTransportTypes([
          { name: 'taxi', display_name: 'Taxi' },
          { name: 'delivery', display_name: 'Delivery' },
          { name: 'pooling', display_name: 'Pooling' },
          { name: 'both', display_name: 'Both' }
        ]);
      } finally {
        setLoading(false);
      }
    };

    fetchTypes();

    return undefined;
  }, [enabled]);

  return { transportTypes, loading, error };
};
