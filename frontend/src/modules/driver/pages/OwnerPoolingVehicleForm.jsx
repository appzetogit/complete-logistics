import React from "react";
import PoolingVehicleForm from "../../admin/pages/pooling/PoolingVehicleForm";
import DriverBottomNav from "../../shared/components/DriverBottomNav";
import { uploadService } from "../../../shared/services/uploadService";
import { ownerPoolingVehicleService } from "../services/registrationService";

const ownerPoolingService = {
  ...ownerPoolingVehicleService,
  uploadImage: async (base64) => {
    const result = await uploadService.uploadImage(base64, "pooling-vehicle");
    return { data: { url: result?.url || result?.secureUrl || "" } };
  },
};

const OwnerPoolingVehicleForm = () => (
  <>
    <PoolingVehicleForm
      service={ownerPoolingService}
      backPath="/taxi/owner/dashboard"
      backLabel="Back to Owner Dashboard"
      pageLabel="Add Pooling Vehicle"
      hidePricingFields
    />
    <DriverBottomNav />
  </>
);

export default OwnerPoolingVehicleForm;
