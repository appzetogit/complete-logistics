import React, { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import PoolingVehicleForm from '../../../admin/pages/pooling/PoolingVehicleForm';
import {
  clearDriverRegistrationSession,
  completePoolingDriverOnboarding,
  getStoredDriverRegistrationSession,
  persistDriverAuthSession,
  saveDriverRegistrationSession,
  savePoolingDriverOnboardingDetails,
  uploadPoolingDriverOnboardingImage,
} from '../../services/registrationService';

const PoolingDriverOnboarding = () => {
  const navigate = useNavigate();
  const session = getStoredDriverRegistrationSession();
  const registrationId = String(session.registrationId || '').trim();
  const phone = String(session.phone || '').replace(/\D/g, '').slice(-10);

  useEffect(() => {
    if (!registrationId || !phone) {
      navigate('/taxi/driver/login', { replace: true });
    }
  }, [navigate, phone, registrationId]);

  const poolingOnboardingService = useMemo(() => ({
    uploadImage: async (image) => uploadPoolingDriverOnboardingImage(image),
    createPoolingVehicle: async (payload) => {
      if (!registrationId || !phone) {
        throw new Error('Pooling onboarding session not found');
      }

      await savePoolingDriverOnboardingDetails({
        registrationId,
        phone,
        ...payload,
      });

      return completePoolingDriverOnboarding({
        registrationId,
        phone,
      });
    },
  }), [phone, registrationId]);

  if (!registrationId || !phone) {
    return null;
  }

  return (
    <PoolingVehicleForm
      service={poolingOnboardingService}
      backPath="/taxi/driver/login"
      backLabel="Back to Login"
      pageLabel="Pooling Driver Onboarding"
      initialFormData={{
        driverName: session.fullName || '',
        driverPhone: phone,
        name: session.poolingVehicleName || '',
        vehicleModel: session.poolingVehicleModel || '',
        vehicleNumber: session.poolingVehicleNumber || '',
        color: session.poolingVehicleColor || '',
        vehicleType: session.poolingVehicleType || 'sedan',
        images: Array.isArray(session.poolingVehicleImages) ? session.poolingVehicleImages : [],
        blueprint: session.poolingVehicleBlueprint || undefined,
      }}
      hidePricingFields
      lockDriverPhone
      placeCreateActionAtEnd
      createActionLabel="Submit For Approval"
      createSuccessMessage="Pooling request submitted"
      helperPanel="Your mobile number becomes the login number for this pooling profile. Submit the vehicle setup and we will send it to admin review."
      onSaveSuccess={async (response, payload) => {
        saveDriverRegistrationSession({
          fullName: payload.driverName || '',
          poolingVehicleName: payload.name || '',
          poolingVehicleModel: payload.vehicleModel || '',
          poolingVehicleNumber: payload.vehicleNumber || '',
          poolingVehicleColor: payload.color || '',
          poolingVehicleType: payload.vehicleType || 'sedan',
          poolingVehicleImages: Array.isArray(payload.images) ? payload.images : [],
          poolingVehicleBlueprint: payload.blueprint || null,
        });

        const result = response?.data?.data || response?.data || response;
        if (result?.token) {
          persistDriverAuthSession({ token: result.token, role: 'pooling_driver' });
        }
        clearDriverRegistrationSession();
        navigate('/taxi/driver/pooling/status', { replace: true });
      }}
    />
  );
};

export default PoolingDriverOnboarding;
