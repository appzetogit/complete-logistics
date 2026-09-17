import { ApiError } from '../../../../utils/ApiError.js';
import { Admin } from '../../admin/models/Admin.js';
import { Owner } from '../../admin/models/Owner.js';
import { Driver } from '../../driver/models/Driver.js';
import { User } from '../../user/models/User.js';
import {
  SUPPORT_TICKET_STATUS,
  SupportTicket,
} from '../models/SupportTicket.js';
import {
  SUPPORT_TICKET_TYPES,
  SUPPORT_TICKET_USER_TYPES,
  SupportTicketTitle,
} from '../models/SupportTicketTitle.js';

const REQUESTER_ROLES = new Set(['user', 'driver', 'owner']);
const STATUS_SET = new Set(SUPPORT_TICKET_STATUS);
const TYPE_SET = new Set(SUPPORT_TICKET_TYPES);
const USER_TYPE_SET = new Set(SUPPORT_TICKET_USER_TYPES);

const toText = (value) => String(value || '').trim();
const toLowerText = (value) => toText(value).toLowerCase();

const toInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const createTicketCode = async () => {
  for (let index = 0; index < 5; index += 1) {
    const random = Math.floor(100000 + Math.random() * 900000);
    const code = `TIC_${Date.now()}${random}`;
    // eslint-disable-next-line no-await-in-loop
    const existing = await SupportTicket.findOne({ ticketCode: code }).select('_id').lean();
    if (!existing) {
      return code;
    }
  }

  throw new ApiError(500, 'Unable to generate support ticket id');
};

const buildRequesterSummary = async ({ role, id }) => {
  const requesterId = String(id || '');
  const normalizedRole = toLowerText(role);

  if (!REQUESTER_ROLES.has(normalizedRole) || !requesterId) {
    throw new ApiError(400, 'Invalid requester identity');
  }

  if (normalizedRole === 'user') {
    const user = await User.findById(requesterId).select('name phone city');
    if (!user) throw new ApiError(404, 'User not found');
    return {
      requesterRole: 'user',
      requesterId: user._id,
      requesterName: user.name || 'User',
      requesterPhone: user.phone || '',
      serviceLocation: user.city || '',
    };
  }

  if (normalizedRole === 'driver') {
    const driver = await Driver.findById(requesterId).select('name phone city');
    if (!driver) throw new ApiError(404, 'Driver not found');
    return {
      requesterRole: 'driver',
      requesterId: driver._id,
      requesterName: driver.name || 'Driver',
      requesterPhone: driver.phone || '',
      serviceLocation: driver.city || '',
    };
  }

  const owner = await Owner.findById(requesterId).select('name owner_name mobile city');
  if (!owner) throw new ApiError(404, 'Owner not found');
  return {
    requesterRole: 'owner',
    requesterId: owner._id,
    requesterName: owner.owner_name || owner.name || 'Owner',
    requesterPhone: owner.mobile || '',
    serviceLocation: owner.city || '',
  };
};

const serializeTicket = (ticket) => ({
  id: String(ticket._id),
  ticketCode: ticket.ticketCode,
  titleId: ticket.titleId ? String(ticket.titleId) : null,
  title: ticket.title || '',
  userType: ticket.userType || '',
  supportType: ticket.supportType || 'general',
  requesterRole: ticket.requesterRole || '',
  requesterId: ticket.requesterId ? String(ticket.requesterId) : '',
  requesterName: ticket.requesterName || '',
  requesterPhone: ticket.requesterPhone || '',
  serviceLocation: ticket.serviceLocation || '',
  status: ticket.status || 'pending',
  assignedAdminId: ticket.assignedAdminId ? String(ticket.assignedAdminId) : null,
  assignedAdminName: ticket.assignedAdminName || '',
  messages: (ticket.messages || []).map((message) => ({
    id: String(message._id),
    senderRole: message.senderRole,
    senderId: String(message.senderId),
    senderName: message.senderName || '',
    message: message.message || '',
    createdAt: message.createdAt,
  })),
  createdAt: ticket.createdAt,
  updatedAt: ticket.updatedAt,
  lastMessageAt: ticket.lastMessageAt,
});

const normalizeStatusFilter = (status) => {
  const value = toLowerText(status);
  if (!value || value === 'all') {
    return null;
  }

  if (value === 'open') {
    return ['pending', 'assigned'];
  }

  if (value === 'resolved' || value === 'closed') {
    return ['closed'];
  }

  return STATUS_SET.has(value) ? [value] : null;
};

export const getSupportTitlesForRequester = async (req, res) => {
  const authRole = toLowerText(req.auth?.role);
  const requestedUserType = toLowerText(req.query.userType);
  const userType =
    authRole === 'admin'
      ? (USER_TYPE_SET.has(requestedUserType) ? requestedUserType : '')
      : authRole;

  if (!USER_TYPE_SET.has(userType)) {
    throw new ApiError(400, 'Unsupported user type for support titles');
  }

  const titles = await SupportTicketTitle.find({ userType, active: true })
    .sort({ createdAt: -1 })
    .lean();

  res.json({
    success: true,
    data: {
      results: titles.map((title) => ({
        id: String(title._id),
        title: title.title,
        userType: title.userType,
        supportType: title.supportType,
        active: title.active,
      })),
    },
  });
};

export const createSupportTicket = async (req, res) => {
  const requesterRole = toLowerText(req.auth?.role);
  if (!REQUESTER_ROLES.has(requesterRole)) {
    throw new ApiError(403, 'Only user, driver or owner can raise support ticket');
  }

  const titleId = toText(req.body.titleId);
  const customTitle = toText(req.body.title);
  const message = toText(req.body.message || req.body.description);

  if (!message) {
    throw new ApiError(400, 'Support message is required');
  }

  let titleDoc = null;
  if (titleId) {
    titleDoc = await SupportTicketTitle.findOne({ _id: titleId, active: true });
    if (!titleDoc) {
      throw new ApiError(404, 'Support ticket title not found');
    }
    if (titleDoc.userType !== requesterRole) {
      if (!customTitle) {
        throw new ApiError(400, 'Selected title is not valid for this user type');
      }
      titleDoc = null;
    }
  }

  const nextTitle = customTitle || titleDoc?.title || 'General Support';
  const nextType = titleDoc?.supportType || 'general';
  const requester = await buildRequesterSummary({ role: requesterRole, id: req.auth?.sub });

  const ticket = await SupportTicket.create({
    ticketCode: await createTicketCode(),
    titleId: titleDoc?._id || null,
    title: nextTitle,
    userType: requesterRole,
    supportType: TYPE_SET.has(nextType) ? nextType : 'general',
    requesterRole: requester.requesterRole,
    requesterId: requester.requesterId,
    requesterName: requester.requesterName,
    requesterPhone: requester.requesterPhone,
    serviceLocation: requester.serviceLocation,
    status: 'pending',
    messages: [
      {
        senderRole: requesterRole,
        senderId: requester.requesterId,
        senderName: requester.requesterName,
        message,
      },
    ],
    lastMessageAt: new Date(),
  });

  res.status(201).json({
    success: true,
    data: serializeTicket(ticket),
  });
};

export const listMySupportTickets = async (req, res) => {
  const requesterRole = toLowerText(req.auth?.role);
  const requesterId = String(req.auth?.sub || '');
  if (!REQUESTER_ROLES.has(requesterRole) || !requesterId) {
    throw new ApiError(403, 'Access denied');
  }

  const statusList = normalizeStatusFilter(req.query.status);
  const page = toInt(req.query.page, 1);
  const limit = toInt(req.query.limit, 20);

  const query = {
    requesterRole,
    requesterId,
  };

  if (statusList) {
    query.status = { $in: statusList };
  }

  const [results, total] = await Promise.all([
    SupportTicket.find(query)
      .sort({ updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    SupportTicket.countDocuments(query),
  ]);

  res.json({
    success: true,
    data: {
      results: results.map(serializeTicket),
      pagination: {
        page,
        limit,
        total,
      },
    },
  });
};

export const getMySupportTicketDetail = async (req, res) => {
  const requesterRole = toLowerText(req.auth?.role);
  const requesterId = String(req.auth?.sub || '');
  const ticketCode = toText(req.params.ticketCode);

  const ticket = await SupportTicket.findOne({
    ticketCode,
    requesterRole,
    requesterId,
  }).lean();

  if (!ticket) {
    throw new ApiError(404, 'Support ticket not found');
  }

  res.json({
    success: true,
    data: serializeTicket(ticket),
  });
};

export const replyMySupportTicket = async (req, res) => {
  const requesterRole = toLowerText(req.auth?.role);
  const requesterId = String(req.auth?.sub || '');
  const ticketCode = toText(req.params.ticketCode);
  const message = toText(req.body.message);

  if (!message) {
    throw new ApiError(400, 'Reply message is required');
  }

  const requester = await buildRequesterSummary({ role: requesterRole, id: requesterId });
  const ticket = await SupportTicket.findOne({
    ticketCode,
    requesterRole,
    requesterId,
  });

  if (!ticket) {
    throw new ApiError(404, 'Support ticket not found');
  }

  ticket.messages.push({
    senderRole: requesterRole,
    senderId: requester.requesterId,
    senderName: requester.requesterName,
    message,
  });
  if (ticket.status === 'closed') {
    ticket.status = 'assigned';
  }
  ticket.lastMessageAt = new Date();
  await ticket.save();

  res.json({
    success: true,
    data: serializeTicket(ticket),
  });
};

export const adminListSupportTitles = async (_req, res) => {
  const titles = await SupportTicketTitle.find().sort({ createdAt: -1 }).lean();

  res.json({
    success: true,
    data: {
      results: titles.map((title) => ({
        id: String(title._id),
        title: title.title,
        userType: title.userType,
        supportType: title.supportType,
        active: title.active,
        createdAt: title.createdAt,
        updatedAt: title.updatedAt,
      })),
    },
  });
};

export const adminCreateSupportTitle = async (req, res) => {
  const title = toText(req.body.title);
  const userType = toLowerText(req.body.userType);
  const supportType = toLowerText(req.body.supportType || 'general');

  if (!title) throw new ApiError(400, 'Title is required');
  if (!USER_TYPE_SET.has(userType)) throw new ApiError(400, 'Invalid user type');
  if (!TYPE_SET.has(supportType)) throw new ApiError(400, 'Invalid support type');

  const created = await SupportTicketTitle.create({
    title,
    userType,
    supportType,
    active: true,
    createdBy: req.auth?.sub || null,
  });

  res.status(201).json({
    success: true,
    data: {
      id: String(created._id),
      title: created.title,
      userType: created.userType,
      supportType: created.supportType,
      active: created.active,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    },
  });
};

export const adminUpdateSupportTitle = async (req, res) => {
  const titleId = toText(req.params.titleId);
  const patch = {};

  if (Object.prototype.hasOwnProperty.call(req.body, 'title')) {
    const title = toText(req.body.title);
    if (!title) throw new ApiError(400, 'Title cannot be empty');
    patch.title = title;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, 'userType')) {
    const userType = toLowerText(req.body.userType);
    if (!USER_TYPE_SET.has(userType)) throw new ApiError(400, 'Invalid user type');
    patch.userType = userType;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, 'supportType')) {
    const supportType = toLowerText(req.body.supportType);
    if (!TYPE_SET.has(supportType)) throw new ApiError(400, 'Invalid support type');
    patch.supportType = supportType;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, 'active')) {
    patch.active = Boolean(req.body.active);
  }

  const updated = await SupportTicketTitle.findByIdAndUpdate(titleId, patch, { returnDocument: 'after' });
  if (!updated) {
    throw new ApiError(404, 'Support title not found');
  }

  res.json({
    success: true,
    data: {
      id: String(updated._id),
      title: updated.title,
      userType: updated.userType,
      supportType: updated.supportType,
      active: updated.active,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    },
  });
};

export const adminDeleteSupportTitle = async (req, res) => {
  const titleId = toText(req.params.titleId);
  const title = await SupportTicketTitle.findByIdAndDelete(titleId);
  if (!title) {
    throw new ApiError(404, 'Support title not found');
  }

  res.json({
    success: true,
    data: { deleted: true },
  });
};

export const adminSupportTicketStats = async (_req, res) => {
  const [totalTickets, pendingTickets, assignedTickets, closedTickets] = await Promise.all([
    SupportTicket.countDocuments(),
    SupportTicket.countDocuments({ status: 'pending' }),
    SupportTicket.countDocuments({ status: 'assigned' }),
    SupportTicket.countDocuments({ status: 'closed' }),
  ]);

  res.json({
    success: true,
    data: {
      totalTickets,
      pendingTickets,
      assignedTickets,
      closedTickets,
    },
  });
};

export const adminListSupportTickets = async (req, res) => {
  const statusList = normalizeStatusFilter(req.query.status);
  const userType = toLowerText(req.query.userType);
  const search = toText(req.query.search);
  const page = toInt(req.query.page, 1);
  const limit = toInt(req.query.limit, 20);

  const query = {};
  if (statusList) query.status = { $in: statusList };
  if (USER_TYPE_SET.has(userType)) query.userType = userType;
  if (search) {
    query.$or = [
      { ticketCode: { $regex: search, $options: 'i' } },
      { title: { $regex: search, $options: 'i' } },
      { requesterName: { $regex: search, $options: 'i' } },
      { requesterPhone: { $regex: search, $options: 'i' } },
    ];
  }

  const [results, total] = await Promise.all([
    SupportTicket.find(query)
      .sort({ updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    SupportTicket.countDocuments(query),
  ]);

  res.json({
    success: true,
    data: {
      results: results.map(serializeTicket),
      pagination: {
        page,
        limit,
        total,
      },
    },
  });
};

export const adminGetSupportTicketDetail = async (req, res) => {
  const ticketCode = toText(req.params.ticketCode);
  const ticket = await SupportTicket.findOne({ ticketCode }).lean();
  if (!ticket) {
    throw new ApiError(404, 'Support ticket not found');
  }

  res.json({
    success: true,
    data: serializeTicket(ticket),
  });
};

export const adminUpdateSupportTicket = async (req, res) => {
  const ticketCode = toText(req.params.ticketCode);
  const patch = {};

  if (Object.prototype.hasOwnProperty.call(req.body, 'status')) {
    const status = toLowerText(req.body.status);
    if (!STATUS_SET.has(status)) {
      throw new ApiError(400, 'Invalid ticket status');
    }
    patch.status = status;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, 'assignToMe')) {
    if (Boolean(req.body.assignToMe)) {
      const admin = await Admin.findById(req.auth?.sub).select('name');
      patch.assignedAdminId = admin?._id || req.auth?.sub;
      patch.assignedAdminName = admin?.name || 'Admin';
      if (!patch.status) {
        patch.status = 'assigned';
      }
    } else {
      patch.assignedAdminId = null;
      patch.assignedAdminName = '';
    }
  }

  const updated = await SupportTicket.findOneAndUpdate({ ticketCode }, patch, { returnDocument: 'after' });
  if (!updated) {
    throw new ApiError(404, 'Support ticket not found');
  }

  res.json({
    success: true,
    data: serializeTicket(updated),
  });
};

export const adminReplySupportTicket = async (req, res) => {
  const ticketCode = toText(req.params.ticketCode);
  const message = toText(req.body.message);
  if (!message) {
    throw new ApiError(400, 'Reply message is required');
  }

  const admin = await Admin.findById(req.auth?.sub).select('name');
  const ticket = await SupportTicket.findOne({ ticketCode });
  if (!ticket) {
    throw new ApiError(404, 'Support ticket not found');
  }

  ticket.messages.push({
    senderRole: 'admin',
    senderId: req.auth?.sub,
    senderName: admin?.name || 'Admin',
    message,
  });

  ticket.assignedAdminId = req.auth?.sub;
  ticket.assignedAdminName = admin?.name || 'Admin';
  if (ticket.status === 'pending') {
    ticket.status = 'assigned';
  }
  ticket.lastMessageAt = new Date();
  await ticket.save();

  res.json({
    success: true,
    data: serializeTicket(ticket),
  });
};
