import { ApiError } from '../../../../utils/ApiError.js';
import { CareerJob } from '../models/CareerJob.js';
import { CareerApplication } from '../models/CareerApplication.js';
import { uploadRawFileToCloudinary } from '../../../../utils/cloudinaryUpload.js';

// --- User / Public Handlers ---

// List all active jobs
export const listActiveJobs = async (req, res) => {
  const jobs = await CareerJob.find({ active: true }).sort({ createdAt: -1 }).lean();
  res.json({
    success: true,
    data: {
      results: jobs.map((job) => ({
        id: String(job._id),
        title: job.title,
        description: job.description,
        department: job.department,
        location: job.location,
        type: job.type,
        createdAt: job.createdAt
      }))
    }
  });
};

// Submit job application
export const submitApplication = async (req, res) => {
  const { jobId, fullName, email, phone, experience, coverLetter, resumeUrl } = req.body;

  if (!jobId || !fullName || !email || !phone || experience === undefined) {
    throw new ApiError(400, 'Required fields: jobId, fullName, email, phone, and experience');
  }

  // Validate job exists and is active
  const job = await CareerJob.findOne({ _id: jobId, active: true }).lean();
  if (!job) {
    throw new ApiError(404, 'Job position not found or is no longer active');
  }

  const application = await CareerApplication.create({
    jobId,
    fullName,
    email,
    phone,
    experience: Number(experience),
    coverLetter: coverLetter || '',
    resumeUrl: resumeUrl || '',
    status: 'pending'
  });

  res.status(201).json({
    success: true,
    data: {
      id: String(application._id),
      fullName: application.fullName,
      email: application.email,
      phone: application.phone,
      experience: application.experience,
      status: application.status,
      createdAt: application.createdAt
    }
  });
};

export const uploadApplicationFile = async (req, res) => {
  const { dataUrl } = req.body;

  if (!dataUrl) {
    throw new ApiError(400, 'dataUrl is required');
  }

  const uploadResult = await uploadRawFileToCloudinary({
    dataUrl,
    publicIdPrefix: 'career-resume',
  });

  res.json({
    success: true,
    data: {
      secureUrl: uploadResult.secureUrl,
      publicId: uploadResult.publicId,
    },
  });
};

// --- Admin Handlers ---

// List all jobs (active & inactive)
export const adminListJobs = async (req, res) => {
  const jobs = await CareerJob.find().sort({ createdAt: -1 }).lean();
  res.json({
    success: true,
    data: {
      results: jobs.map((job) => ({
        id: String(job._id),
        title: job.title,
        description: job.description,
        department: job.department,
        location: job.location,
        type: job.type,
        active: job.active,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt
      }))
    }
  });
};

// Create a new job
export const adminCreateJob = async (req, res) => {
  const { title, description, department, location, type, active } = req.body;

  if (!title || !description || !department || !location) {
    throw new ApiError(400, 'Title, description, department, and location are required');
  }

  const job = await CareerJob.create({
    title,
    description,
    department,
    location,
    type: type || 'Full-time',
    active: active !== false
  });

  res.status(201).json({
    success: true,
    data: {
      id: String(job._id),
      title: job.title,
      description: job.description,
      department: job.department,
      location: job.location,
      type: job.type,
      active: job.active,
      createdAt: job.createdAt
    }
  });
};

// Update a job position
export const adminUpdateJob = async (req, res) => {
  const { id } = req.params;
  const { title, description, department, location, type, active } = req.body;

  const patch = {};
  if (title !== undefined) patch.title = title;
  if (description !== undefined) patch.description = description;
  if (department !== undefined) patch.department = department;
  if (location !== undefined) patch.location = location;
  if (type !== undefined) patch.type = type;
  if (active !== undefined) patch.active = Boolean(active);

  const job = await CareerJob.findByIdAndUpdate(id, patch, { returnDocument: 'after' });
  if (!job) {
    throw new ApiError(404, 'Job position not found');
  }

  res.json({
    success: true,
    data: {
      id: String(job._id),
      title: job.title,
      description: job.description,
      department: job.department,
      location: job.location,
      type: job.type,
      active: job.active,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt
    }
  });
};

// Delete a job position
export const adminDeleteJob = async (req, res) => {
  const { id } = req.params;
  const job = await CareerJob.findByIdAndDelete(id);
  if (!job) {
    throw new ApiError(404, 'Job position not found');
  }

  // Also delete associated applications
  await CareerApplication.deleteMany({ jobId: id });

  res.json({
    success: true,
    data: { deleted: true }
  });
};

// List all applications
export const adminListApplications = async (req, res) => {
  const applications = await CareerApplication.find()
    .populate('jobId', 'title department')
    .sort({ createdAt: -1 })
    .lean();

  res.json({
    success: true,
    data: {
      results: applications.map((app) => ({
        id: String(app._id),
        jobId: app.jobId ? String(app.jobId._id) : null,
        jobTitle: app.jobId ? app.jobId.title : 'Deleted Position',
        jobDepartment: app.jobId ? app.jobId.department : '',
        fullName: app.fullName,
        email: app.email,
        phone: app.phone,
        experience: app.experience,
        coverLetter: app.coverLetter,
        resumeUrl: app.resumeUrl,
        status: app.status,
        createdAt: app.createdAt
      }))
    }
  });
};

// Update application status
export const adminUpdateApplicationStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const validStatuses = ['pending', 'reviewed', 'shortlisted', 'rejected'];
  if (!status || !validStatuses.includes(status)) {
    throw new ApiError(400, `Invalid status. Valid options: ${validStatuses.join(', ')}`);
  }

  const application = await CareerApplication.findByIdAndUpdate(
    id,
    { status },
    { returnDocument: 'after' }
  ).populate('jobId', 'title department');

  if (!application) {
    throw new ApiError(404, 'Career application not found');
  }

  res.json({
    success: true,
    data: {
      id: String(application._id),
      jobTitle: application.jobId ? application.jobId.title : 'Deleted Position',
      fullName: application.fullName,
      status: application.status,
      updatedAt: application.updatedAt
    }
  });
};

// Delete a career application
export const adminDeleteApplication = async (req, res) => {
  const { id } = req.params;
  const application = await CareerApplication.findByIdAndDelete(id);
  if (!application) {
    throw new ApiError(404, 'Career application not found');
  }

  res.json({
    success: true,
    data: { deleted: true }
  });
};

