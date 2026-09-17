import mongoose from 'mongoose';

const pointSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['Point'],
      required: true,
    },
    coordinates: {
      type: [Number],
      required: true,
    },
  },
  { _id: false },
);

const polygonSchema = new mongoose.Schema(
  {
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
  { _id: false },
);

const airportSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    code: {
      type: String,
      default: '',
      trim: true,
      uppercase: true,
    },
    service_location_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxiServiceLocation',
      default: null,
    },
    zone_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxiZone',
      default: null,
    },
    terminal: {
      type: String,
      default: '',
      trim: true,
    },
    address: {
      type: String,
      default: '',
      trim: true,
    },
    contact_number: {
      type: String,
      default: '',
      trim: true,
    },
    latitude: {
      type: Number,
      default: null,
    },
    longitude: {
      type: Number,
      default: null,
    },
    location: {
      type: pointSchema,
      default: undefined,
    },
    boundary: {
      type: polygonSchema,
      default: undefined,
    },
    airport_surge: {
      type: Number,
      default: 0,
      min: 0,
    },
    support_airport_fee: {
      type: Number,
      default: 0,
      min: 0,
    },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
    },
    active: {
      type: Boolean,
      default: true,
    },
    pickup_availability: {
      type: Boolean,
      default: true,
    },
    drop_availability: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

airportSchema.index({ name: 1 });
airportSchema.index({ code: 1 });
airportSchema.index({ service_location_id: 1, status: 1 });
airportSchema.index({ location: '2dsphere' });
airportSchema.index({ boundary: '2dsphere' });

export const Airport = mongoose.models.TaxiAirport || mongoose.model('TaxiAirport', airportSchema);
