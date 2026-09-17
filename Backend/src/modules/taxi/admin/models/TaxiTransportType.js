import mongoose from 'mongoose';

const taxiTransportTypeSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: true, 
    unique: true 
  },
  display_name: {
    type: String,
    required: true
  },
  active: { 
    type: Boolean, 
    default: true 
  }
}, { timestamps: true });

const TaxiTransportType = mongoose.model('TaxiTransportType', taxiTransportTypeSchema);

export default TaxiTransportType;
