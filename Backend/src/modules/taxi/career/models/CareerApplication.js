import mongoose from 'mongoose';

const careerApplicationSchema = new mongoose.Schema(
  {
    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxiCareerJob',
      required: true,
      index: true
    },
    fullName: {
      type: String,
      required: true,
      trim: true
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true
    },
    phone: {
      type: String,
      required: true,
      trim: true
    },
    experience: {
      type: Number, // Years of experience
      required: true
    },
    coverLetter: {
      type: String,
      trim: true
    },
    resumeUrl: {
      type: String, // Portfolio link / resume link / text field
      trim: true
    },
    status: {
      type: String,
      enum: ['pending', 'reviewed', 'shortlisted', 'rejected'],
      default: 'pending',
      index: true
    }
  },
  { timestamps: true }
);

export const CareerApplication =
  mongoose.models.TaxiCareerApplication ||
  mongoose.model('TaxiCareerApplication', careerApplicationSchema);
