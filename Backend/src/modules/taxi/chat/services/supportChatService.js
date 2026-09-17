import mongoose from 'mongoose';
import { ApiError } from '../../../../utils/ApiError.js';
import { Admin } from '../../admin/models/Admin.js';
import { Driver } from '../../driver/models/Driver.js';
import { User } from '../../user/models/User.js';
import { SupportChatMessage } from '../models/SupportChatMessage.js';

const roleModelMap = {
  admin: Admin,
  driver: Driver,
  user: User,
};

const supportAdminCache = {
  id: null,
  loadedAt: 0,
};

const SUPPORT_ADMIN_CACHE_TTL_MS = 60_000;
const SUPPORT_ROLE_RE = /^(admin|user|driver)$/;
const SUPPORT_CONVERSATION_CANONICAL_RE = /^(user|driver):([^:]+):([^:]+)$/;
const SUPPORT_CONVERSATION_LEGACY_RE = /^admin:([^|]+)\|(user|driver):([^|]+)$/;

let chatIo = null;

const toObjectId = (value) => {
  if (!value) {
    return null;
  }

  return new mongoose.Types.ObjectId(String(value));
};

const normalizeText = (value) => String(value || '').trim();

const normalizeRole = (role) => {
  const nextRole = String(role || '').toLowerCase();
  return SUPPORT_ROLE_RE.test(nextRole) ? nextRole : null;
};

const serializeEntity = (entity, role) => ({
  id: String(entity._id),
  role,
  name: entity.name || '',
  phone: entity.phone || '',
});

const buildLegacySupportConversationKey = ({ adminId, peerRole, peerId }) =>
  `admin:${String(adminId)}|${String(peerRole)}:${String(peerId)}`;

const buildSupportConversationKey = ({ channel, adminId, peerId }) =>
  `${String(channel)}:${String(adminId)}:${String(peerId)}`;

const uniqueValues = (values) => Array.from(new Set(values.filter(Boolean)));

const buildSupportConversationKeyFromMessage = (message) => {
  const senderRole = normalizeRole(message?.senderRole);
  const receiverRole = normalizeRole(message?.receiverRole);
  const senderId = message?.senderId ? String(message.senderId) : '';
  const receiverId = message?.receiverId ? String(message.receiverId) : '';

  if (senderRole === 'admin' && receiverRole && senderId && receiverId) {
    return buildSupportConversationKey({
      channel: receiverRole,
      adminId: senderId,
      peerId: receiverId,
    });
  }

  if (receiverRole === 'admin' && senderRole && senderRole !== 'admin' && senderId && receiverId) {
    return buildSupportConversationKey({
      channel: senderRole,
      adminId: receiverId,
      peerId: senderId,
    });
  }

  return String(message?.conversationKey || '');
};

const buildConversationIdentityQuery = async ({ role, id, conversationKey }) => {
  const normalizedRole = normalizeRole(role);
  const entityId = String(id || '');
  const parsed = parseSupportConversationKey(conversationKey);

  if (!normalizedRole || !entityId || !parsed) {
    throw new ApiError(400, 'Conversation lookup requires identity and a conversation key');
  }

  if (normalizedRole === 'admin') {
    return {
      $or: [
        {
          senderRole: 'admin',
          receiverRole: parsed.peerRole,
          receiverId: toObjectId(parsed.peerId),
        },
        {
          senderRole: parsed.peerRole,
          senderId: toObjectId(parsed.peerId),
          receiverRole: 'admin',
        },
      ],
    };
  }

  if (parsed.peerRole !== normalizedRole || parsed.peerId !== entityId) {
    throw new ApiError(403, 'Conversation does not belong to this support thread');
  }

  return {
    $or: [
      {
        senderRole: normalizedRole,
        senderId: toObjectId(entityId),
        receiverRole: 'admin',
      },
      {
        senderRole: 'admin',
        receiverRole: normalizedRole,
        receiverId: toObjectId(entityId),
      },
    ],
  };
};

export const setSupportChatServer = (io) => {
  chatIo = io;
};

export const getSupportChatServer = () => chatIo;

export const getSupportRoom = (conversationKey) => `chat:conversation:${conversationKey}`;

export const getSupportRoleRoom = (role) => `chat:role:${role}`;

export const getSupportParticipantRoom = (role, entityId) => `chat:participant:${role}:${entityId}`;

export const parseSupportConversationKey = (conversationKey) => {
  const raw = String(conversationKey || '');
  const canonicalMatch = SUPPORT_CONVERSATION_CANONICAL_RE.exec(raw);

  if (canonicalMatch) {
    const channel = canonicalMatch[1];
    const adminId = canonicalMatch[2];
    const peerId = canonicalMatch[3];
    const legacyKey = buildLegacySupportConversationKey({
      adminId,
      peerRole: channel,
      peerId,
    });

    return {
      format: 'canonical',
      channel,
      adminId,
      peerRole: channel,
      peerId,
      canonicalKey: raw,
      legacyKey,
      keys: uniqueValues([raw, legacyKey]),
    };
  }

  const legacyMatch = SUPPORT_CONVERSATION_LEGACY_RE.exec(raw);

  if (!legacyMatch) {
    return null;
  }

  const adminId = legacyMatch[1];
  const peerRole = legacyMatch[2];
  const peerId = legacyMatch[3];
  const canonicalKey = buildSupportConversationKey({
    channel: peerRole,
    adminId,
    peerId,
  });

  return {
    format: 'legacy',
    channel: peerRole,
    adminId,
    peerRole,
    peerId,
    canonicalKey,
    legacyKey: raw,
    keys: uniqueValues([canonicalKey, raw]),
  };
};

const getConversationKeys = (conversationKey) => {
  const parsed = parseSupportConversationKey(conversationKey);
  return parsed?.keys || null;
};

const getEntityModel = (role) => roleModelMap[normalizeRole(role)];

export const resolveEntitySummary = async (role, entityId) => {
  const normalizedRole = normalizeRole(role);
  const Model = getEntityModel(normalizedRole);

  if (!Model) {
    throw new ApiError(400, 'Unsupported chat role');
  }

  const entity = await Model.findById(entityId).select('name phone');

  if (!entity) {
    throw new ApiError(404, `${normalizedRole} account not found`);
  }

  return serializeEntity(entity, normalizedRole);
};

export const resolveDefaultSupportAdminId = async () => {
  const now = Date.now();

  if (supportAdminCache.id && now - supportAdminCache.loadedAt < SUPPORT_ADMIN_CACHE_TTL_MS) {
    return supportAdminCache.id;
  }

  const admin = await Admin.findOne().sort({ createdAt: 1 }).select('_id');

  if (!admin) {
    throw new ApiError(503, 'No admin account is available for support chat');
  }

  supportAdminCache.id = String(admin._id);
  supportAdminCache.loadedAt = now;
  return supportAdminCache.id;
};

export const resolveSupportConversationKey = async ({
  senderRole,
  senderId,
  receiverRole,
  receiverId,
}) => {
  const normalizedSenderRole = normalizeRole(senderRole);
  const normalizedReceiverRole = normalizeRole(receiverRole);

  if (!normalizedSenderRole || !senderId) {
    throw new ApiError(400, 'Sender identity is required');
  }

  if (normalizedSenderRole === 'admin') {
    if (!normalizedReceiverRole || !receiverId || normalizedReceiverRole === 'admin') {
      throw new ApiError(400, 'Admin support messages need a user or driver recipient');
    }

    return buildSupportConversationKey({
      channel: normalizedReceiverRole,
      adminId: senderId,
      peerId: receiverId,
    });
  }

  if (normalizedSenderRole !== 'user' && normalizedSenderRole !== 'driver') {
    throw new ApiError(400, 'Unsupported sender role');
  }

  if (normalizedReceiverRole && normalizedReceiverRole !== 'admin') {
    throw new ApiError(400, 'Support chats can only go to admin');
  }

  const adminId = normalizedReceiverRole === 'admin' && receiverId
    ? String(receiverId)
    : await resolveDefaultSupportAdminId();

  return buildSupportConversationKey({
    channel: normalizedSenderRole,
    adminId,
    peerId: senderId,
  });
};

export const resolveSupportPeerFromConversationKey = async (conversationKey, authRole) => {
  const parsed = parseSupportConversationKey(conversationKey);

  if (!parsed) {
    throw new ApiError(400, 'Invalid conversation key');
  }

  const normalizedRole = normalizeRole(authRole);

  if (normalizedRole === 'admin') {
    return {
      role: parsed.peerRole,
      id: parsed.peerId,
      adminId: parsed.adminId,
      canonicalKey: parsed.canonicalKey,
      legacyKey: parsed.legacyKey,
      keys: parsed.keys,
    };
  }

  return {
    role: 'admin',
    id: parsed.adminId,
    adminId: parsed.adminId,
    canonicalKey: parsed.canonicalKey,
    legacyKey: parsed.legacyKey,
    keys: parsed.keys,
  };
};

const serializeMessage = (doc) => ({
  id: String(doc._id),
  conversationKey: doc.conversationKey,
  channel: doc.channel,
  message: doc.message,
  sender: {
    role: doc.senderRole,
    id: String(doc.senderId),
    name: doc.senderName || '',
    phone: doc.senderPhone || '',
  },
  receiver: {
    role: doc.receiverRole,
    id: String(doc.receiverId),
    name: doc.receiverName || '',
    phone: doc.receiverPhone || '',
  },
  readAt: doc.readAt || null,
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
});

export const createSupportMessage = async ({
  senderRole,
  senderId,
  receiverRole,
  receiverId,
  conversationKey,
  message,
}) => {
  const normalizedSenderRole = normalizeRole(senderRole);
  const normalizedReceiverRole = receiverRole ? normalizeRole(receiverRole) : null;
  const text = normalizeText(message);

  if (!normalizedSenderRole || !senderId) {
    throw new ApiError(400, 'Sender identity is required');
  }

  if (!text) {
    throw new ApiError(400, 'Message cannot be empty');
  }

  const parsedConversation = conversationKey ? parseSupportConversationKey(conversationKey) : null;
  const resolvedConversationKey = await resolveSupportConversationKey({
    senderRole: normalizedSenderRole,
    senderId,
    receiverRole: normalizedReceiverRole,
    receiverId,
  });

  const parsed = parseSupportConversationKey(resolvedConversationKey);

  if (!parsed) {
    throw new ApiError(400, 'Unable to resolve support conversation');
  }

  const senderSummary = await resolveEntitySummary(normalizedSenderRole, senderId);
  const receiverSummary = await resolveEntitySummary(
    normalizedSenderRole === 'admin' ? normalizedReceiverRole : 'admin',
    normalizedSenderRole === 'admin' ? receiverId : parsed.adminId,
  );

  const doc = await SupportChatMessage.create({
    conversationKey: buildSupportConversationKeyFromMessage({
      conversationKey: parsedConversation?.canonicalKey || resolvedConversationKey,
      senderRole: normalizedSenderRole,
      receiverRole: normalizedReceiverRole || (normalizedSenderRole === 'admin' ? 'admin' : 'admin'),
      senderId,
      receiverId: normalizedSenderRole === 'admin' ? receiverId : parsed.adminId,
    }),
    senderRole: normalizedSenderRole,
    senderId: toObjectId(senderId),
    senderName: senderSummary.name,
    senderPhone: senderSummary.phone,
    receiverRole: normalizedSenderRole === 'admin' ? normalizedReceiverRole : 'admin',
    receiverId: toObjectId(normalizedSenderRole === 'admin' ? receiverId : parsed.adminId),
    receiverName: receiverSummary.name,
    receiverPhone: receiverSummary.phone,
    message: text,
  });

  return serializeMessage(doc);
};

export const listSupportConversations = async ({ role, id }) => {
  const normalizedRole = normalizeRole(role);
  const entityId = String(id || '');

  if (!normalizedRole || !entityId) {
    throw new ApiError(400, 'Chat identity is required');
  }

  const query =
    normalizedRole === 'admin'
      ? {
          $or: [
            { senderRole: 'admin' },
            { receiverRole: 'admin' },
          ],
        }
      : {
          $or: [
            { senderRole: normalizedRole, senderId: toObjectId(entityId) },
            { receiverRole: normalizedRole, receiverId: toObjectId(entityId) },
          ],
        };

  const messages = await SupportChatMessage.find(query)
    .sort({ createdAt: -1 })
    .lean();

  const grouped = new Map();

  for (const message of messages) {
    const canonicalKey = buildSupportConversationKeyFromMessage(message);
    const current = grouped.get(canonicalKey);

    if (!current) {
      grouped.set(canonicalKey, {
        latest: message,
        unreadCount: 0,
      });
    }

    if (message.receiverRole === normalizedRole && !message.readAt) {
      const existing = grouped.get(canonicalKey);
      existing.unreadCount += 1;
    }
  }

  if (normalizedRole !== 'admin' && grouped.size === 0) {
    const adminId = await resolveDefaultSupportAdminId();
    const conversationKey = buildSupportConversationKey({
      channel: normalizedRole,
      adminId,
      peerId: id,
    });

    return [
      {
        conversationKey,
        peer: {
          role: 'admin',
          id: adminId,
          name: 'Support Team',
          phone: '',
        },
        latestMessage: null,
        unreadCount: 0,
        updatedAt: null,
      },
    ];
  }

  return Array.from(grouped.entries())
    .map(([conversationKey, entry]) => {
      const latest = entry.latest;
      const parsed = parseSupportConversationKey(conversationKey);

      return {
        conversationKey,
        peer:
          normalizedRole === 'admin'
            ? {
                role: parsed?.peerRole || latest.receiverRole,
                id: parsed?.peerId || String(latest.receiverId),
                name:
                  latest.senderRole === 'admin'
                    ? latest.receiverName || 'Support'
                    : latest.senderName || 'Support',
                phone:
                  latest.senderRole === 'admin'
                    ? latest.receiverPhone || ''
                    : latest.senderPhone || '',
              }
            : {
                role: 'admin',
                id: parsed?.adminId || String(latest.receiverId),
                name:
                  latest.senderRole === 'admin'
                    ? latest.senderName || 'Support Team'
                    : latest.receiverName || 'Support Team',
                phone:
                  latest.senderRole === 'admin'
                    ? latest.senderPhone || ''
                    : latest.receiverPhone || '',
              },
        latestMessage: serializeMessage(latest),
        unreadCount: entry.unreadCount,
        updatedAt: latest.createdAt,
      };
    })
    .sort((left, right) => new Date(right.updatedAt) - new Date(left.updatedAt));
};

export const getSupportMessages = async ({ role, id, conversationKey }) => {
  const normalizedRole = normalizeRole(role);
  const entityId = String(id || '');

  if (!normalizedRole || !entityId || !conversationKey) {
    throw new ApiError(400, 'Conversation lookup requires identity and a conversation key');
  }

  const query = await buildConversationIdentityQuery({
    role: normalizedRole,
    id: entityId,
    conversationKey,
  });

  const messages = await SupportChatMessage.find(query).sort({ createdAt: 1 }).lean();

  return messages.map((message) => serializeMessage(message));
};

export const markSupportMessagesAsRead = async ({ role, id, conversationKey }) => {
  const normalizedRole = normalizeRole(role);
  const entityId = String(id || '');

  if (!normalizedRole || !entityId || !conversationKey) {
    throw new ApiError(400, 'Conversation read receipt requires identity and a conversation key');
  }

  const parsed = parseSupportConversationKey(conversationKey);

  if (!parsed) {
    throw new ApiError(400, 'Invalid conversation key');
  }

  await resolveSupportPeerFromConversationKey(parsed.canonicalKey, normalizedRole);

  const query = await buildConversationIdentityQuery({
    role: normalizedRole,
    id: entityId,
    conversationKey,
  });

  const result = await SupportChatMessage.updateMany(
    {
      ...query,
      receiverRole: normalizedRole,
      receiverId: toObjectId(entityId),
      readAt: null,
    },
    {
      $set: {
        readAt: new Date(),
      },
    },
  );

  return {
    updatedCount: result.modifiedCount || 0,
  };
};

export const deleteSupportConversationMessages = async ({ role, id, conversationKey }) => {
  const normalizedRole = normalizeRole(role);
  const entityId = String(id || '');

  if (!normalizedRole || !entityId || !conversationKey) {
    throw new ApiError(400, 'Conversation delete requires identity and a conversation key');
  }

  const parsed = parseSupportConversationKey(conversationKey);

  if (!parsed) {
    throw new ApiError(400, 'Invalid conversation key');
  }

  const query = await buildConversationIdentityQuery({
    role: normalizedRole,
    id: entityId,
    conversationKey: parsed.canonicalKey,
  });

  const result = await SupportChatMessage.deleteMany({
    ...query,
    conversationKey: { $in: parsed.keys },
  });

  return {
    deletedCount: result.deletedCount || 0,
    conversationKey: parsed.canonicalKey,
    keys: parsed.keys,
    adminId: parsed.adminId,
    peerRole: parsed.peerRole,
    peerId: parsed.peerId,
  };
};

export const broadcastSupportMessage = (message) => {
  if (!chatIo || !message) {
    return;
  }

  const parsed = parseSupportConversationKey(message.conversationKey);
  const rooms = parsed ? parsed.keys.map((key) => getSupportRoom(key)) : [getSupportRoom(message.conversationKey)];

  for (const room of rooms) {
    chatIo.to(room).emit('chat:message', message);
  }

  chatIo.to(getSupportParticipantRoom(message.sender.role, message.sender.id)).emit('chat:message', message);
  chatIo.to(getSupportParticipantRoom(message.receiver.role, message.receiver.id)).emit('chat:message', message);
  chatIo.to(getSupportRoleRoom('admin')).emit('chat:conversation-updated', {
    conversationKey: message.conversationKey,
    message,
  });

  if (message.sender.role !== 'admin') {
    chatIo.to(getSupportRoleRoom(message.sender.role)).emit('chat:conversation-updated', {
      conversationKey: message.conversationKey,
      message,
    });
  }

  if (message.receiver.role !== 'admin') {
    chatIo.to(getSupportRoleRoom(message.receiver.role)).emit('chat:conversation-updated', {
      conversationKey: message.conversationKey,
      message,
    });
  }
};

export const broadcastSupportConversationDeleted = (payload) => {
  if (!chatIo || !payload?.conversationKey) {
    return;
  }

  const parsed = parseSupportConversationKey(payload.conversationKey);
  const keys = payload.keys || parsed?.keys || [payload.conversationKey];
  const nextPayload = {
    conversationKey: parsed?.canonicalKey || payload.conversationKey,
    keys,
    deletedBy: payload.deletedBy || null,
  };

  for (const key of keys) {
    chatIo.to(getSupportRoom(key)).emit('chat:conversation-deleted', nextPayload);
  }

  if (!parsed) {
    return;
  }

  chatIo.to(getSupportParticipantRoom('admin', parsed.adminId)).emit('chat:conversation-deleted', nextPayload);
  chatIo.to(getSupportParticipantRoom(parsed.peerRole, parsed.peerId)).emit('chat:conversation-deleted', nextPayload);
  chatIo.to(getSupportRoleRoom('admin')).emit('chat:conversation-deleted', nextPayload);
  chatIo.to(getSupportRoleRoom(parsed.peerRole)).emit('chat:conversation-deleted', nextPayload);
};
