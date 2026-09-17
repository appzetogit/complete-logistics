import mongoose from 'mongoose';

const zoneSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    service_location_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxiServiceLocation',
      default: null,
    },
    unit: {
      type: String,
      default: 'km',
      trim: true,
    },
    peak_zone_ride_count: {
      type: Number,
      default: null,
    },
    peak_zone_radius: {
      type: Number,
      default: null,
    },
    peak_zone_selection_duration: {
      type: Number,
      default: null,
    },
    peak_zone_duration: {
      type: Number,
      default: null,
    },
    peak_zone_surge_percentage: {
      type: Number,
      default: null,
    },
    maximum_distance_for_regular_rides: {
      type: Number,
      default: null,
    },
    maximum_distance_for_outstation_rides: {
      type: Number,
      default: null,
    },
    active: {
      type: Boolean,
      default: true,
    },
    status: {
      type: String,
      default: 'active',
      trim: true,
    },
    boundary_mode: {
      type: String,
      enum: ['polygon', 'circle'],
      default: 'polygon',
      trim: true,
    },
    circle_center: {
      lat: {
        type: Number,
        default: null,
      },
      lng: {
        type: Number,
        default: null,
      },
    },
    circle_radius_meters: {
      type: Number,
      default: null,
    },
    geometry: {
      type: {
        type: String,
        enum: ['Polygon'],
        required: true,
      },
      coordinates: {
        type: [[[Number]]],
        required: true,
      },
    },
  },
  { 
    timestamps: true,
  },
);

zoneSchema.index({ geometry: '2dsphere' });

export const Zone = mongoose.models.TaxiZone || mongoose.model('TaxiZone', zoneSchema);
