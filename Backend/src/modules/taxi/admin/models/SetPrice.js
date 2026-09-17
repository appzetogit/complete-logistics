import mongoose from 'mongoose';

const { ObjectId, Mixed } = mongoose.Schema.Types;

const setPriceSchema = new mongoose.Schema(
  {
    zone_id: {
      type: ObjectId,
      ref: 'TaxiZone',
      default: null,
    },
    service_location_id: {
      type: ObjectId,
      ref: 'TaxiServiceLocation',
      default: null,
    },
    pricing_scope: {
      type: String,
      default: 'ride',
      trim: true,
    },
    transport_type: {
      type: String,
      default: 'taxi',
      trim: true,
    },
    vehicle_type: {
      type: ObjectId,
      ref: 'TaxiVehicle',
      default: null,
    },
    package_type_id: {
      type: ObjectId,
      ref: 'TaxiRentalPackageType',
      default: null,
    },
    package_destination: {
      type: String,
      default: '',
      trim: true,
    },
    package_availability: {
      type: String,
      default: 'available',
      trim: true,
    },
    package_vehicle_prices: [
      {
        vehicle_type: {
          type: ObjectId,
          ref: 'TaxiVehicle',
          default: null,
        },
        base_price: {
          type: Number,
          default: 0,
        },
        free_distance: {
          type: Number,
          default: 0,
        },
        distance_price: {
          type: Number,
          default: 0,
        },
        free_time: {
          type: Number,
          default: 0,
        },
        time_price: {
          type: Number,
          default: 0,
        },
        admin_commision_type: {
          type: Number,
          default: 1,
        },
        admin_commision: {
          type: Number,
          default: 0,
        },
        admin_commission_type_from_driver: {
          type: Number,
          default: 1,
        },
        admin_commission_from_driver: {
          type: Number,
          default: 0,
        },
        admin_commission_type_for_owner: {
          type: Number,
          default: 1,
        },
        admin_commission_for_owner: {
          type: Number,
          default: 0,
        },
        service_tax: {
          type: Number,
          default: 0,
        },
        cancellation_fee: {
          type: Number,
          default: 0,
        },
        active: {
          type: Number,
          default: 1,
        },
      },
    ],
    app_modules: {
      type: Mixed,
      default: null,
    },
    vehicle_preference: {
      type: Mixed,
      default: null,
    },
    payment_type: {
      type: [String],
      default: ['cash'],
    },
    customer_commission_type: {
      type: String,
      default: 'percentage',
      trim: true,
    },
    customer_commission: {
      type: Number,
      default: null,
    },
    driver_commission_type: {
      type: String,
      default: 'percentage',
      trim: true,
    },
    driver_commission: {
      type: Number,
      default: null,
    },
    owner_commission_type: {
      type: String,
      default: 'percentage',
      trim: true,
    },
    owner_commission: {
      type: Number,
      default: null,
    },
    service_tax: {
      type: Number,
      default: null,
    },
    eta_sequence: {
      type: Number,
      default: null,
    },
    base_price: {
      type: Number,
      default: null,
    },
    base_distance: {
      type: Number,
      default: null,
    },
    price_per_distance: {
      type: Number,
      default: null,
    },
    time_price: {
      type: Number,
      default: null,
    },
    waiting_charge: {
      type: Number,
      default: null,
    },
    outstation_base_price: {
      type: Number,
      default: 0,
    },
    outstation_base_distance: {
      type: Number,
      default: 0,
    },
    outstation_price_per_distance: {
      type: Number,
      default: 0,
    },
    outstation_time_price: {
      type: Number,
      default: 0,
    },
    free_waiting_before: {
      type: Number,
      default: null,
    },
    free_waiting_after: {
      type: Number,
      default: null,
    },
    enable_airport_ride: {
      type: Boolean,
      default: false,
    },
    enable_outstation_ride: {
      type: Boolean,
      default: false,
    },
    user_cancellation_fee_type: {
      type: String,
      default: 'percentage',
      trim: true,
    },
    user_cancellation_fee: {
      type: Number,
      default: null,
    },
    driver_cancellation_fee_type: {
      type: String,
      default: 'percentage',
      trim: true,
    },
    driver_cancellation_fee: {
      type: Number,
      default: null,
    },
    cancellation_fee_goes_to: {
      type: String,
      default: 'admin',
      trim: true,
    },
    enable_ride_sharing: {
      type: Boolean,
      default: false,
    },
    admin_commission_type_for_owner: {
      type: Number,
      default: 1, // 1 for percentage, 0 for fixed
    },
    admin_commission_for_owner: {
      type: Number,
      default: 0,
    },
    admin_commision_type: { // Keep same spelling as user sample
      type: Number,
      default: 1,
    },
    admin_commision: {
      type: Number,
      default: 0,
    },
    admin_commission_type_from_driver: {
      type: Number,
      default: 1,
    },
    admin_commission_from_driver: {
      type: Number,
      default: 0,
    },
    service_tax: {
      type: Number,
      default: 0,
    },
    airport_surge: {
      type: Number,
      default: 0,
    },
    support_airport_fee: {
      type: Number,
      default: 0,
    },
    support_outstation: {
      type: Number,
      default: 0,
    },
    enable_shared_ride: {
      type: Number,
      default: 0,
    },
    price_per_seat: {
      type: Number,
      default: 0,
    },
    shared_price_per_distance: {
      type: Number,
      default: 0,
    },
    shared_cancel_fee: {
      type: Number,
      default: 0,
    },
    order_number: {
      type: Number,
      default: 1,
    },
    bill_status: {
      type: Number,
      default: 1,
    },
    status: {
      type: String,
      default: 'active',
      trim: true,
    },
    active: {
      type: Number,
      default: 1,
    },
  },
  { timestamps: true },
);

setPriceSchema.index({ zone_id: 1, transport_type: 1, vehicle_type: 1 });
setPriceSchema.index({ status: 1, active: 1 });
setPriceSchema.index({ pricing_scope: 1, package_type_id: 1, package_destination: 1 });
setPriceSchema.index({ pricing_scope: 1, createdAt: -1 });
setPriceSchema.index({ pricing_scope: 1, zone_id: 1, createdAt: -1 });
setPriceSchema.index({ pricing_scope: 1, service_location_id: 1, createdAt: -1 });

export const SetPrice = mongoose.models.TaxiSetPrice || mongoose.model('TaxiSetPrice', setPriceSchema);
