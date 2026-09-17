import { ApiError } from '../../../../utils/ApiError.js';
import {
  broadcastSupportConversationDeleted,
  broadcastSupportMessage,
  createSupportMessage,
  deleteSupportConversationMessages,
  getSupportMessages,
  listSupportConversations,
  markSupportMessagesAsRead,
  resolveSupportPeerFromConversationKey,
} from '../services/supportChatService.js';

export const getSupportConversationList = async (req, res) => {
  const conversations = await listSupportConversations({
    role: req.auth.role,
    id: req.auth.sub,
  });

  res.json({
    success: true,
    data: {
      conversations,
    },
  });
};

export const getSupportConversationMessages = async (req, res) => {
  const { conversationKey } = req.params;

  const messages = await getSupportMessages({
    role: req.auth.role,
    id: req.auth.sub,
    conversationKey,
  });

  res.json({
    success: true,
    data: {
      conversationKey,
      messages,
    },
  });
};

export const markSupportConversationRead = async (req, res) => {
  const { conversationKey } = req.params;

  const result = await markSupportMessagesAsRead({
    role: req.auth.role,
    id: req.auth.sub,
    conversationKey,
  });

  res.json({
    success: true,
    data: {
      conversationKey,
      ...result,
    },
  });
};

export const sendSupportMessage = async (req, res) => {
  const { message, receiverRole, receiverId, conversationKey } = req.body;

  let nextReceiverRole = receiverRole;
  let nextReceiverId = receiverId;

  if (req.auth.role === 'admin' && (!nextReceiverRole || !nextReceiverId)) {
    if (!conversationKey) {
      throw new ApiError(400, 'Admin replies require a recipient');
    }

    const peer = await resolveSupportPeerFromConversationKey(conversationKey, req.auth.role);
    nextReceiverRole = peer.role;
    nextReceiverId = peer.id;
  }

  const savedMessage = await createSupportMessage({
    senderRole: req.auth.role,
    senderId: req.auth.sub,
    receiverRole: nextReceiverRole,
    receiverId: nextReceiverId,
    conversationKey,
    message,
  });

  broadcastSupportMessage(savedMessage);

  res.status(201).json({
    success: true,
    data: {
      message: savedMessage,
      conversationKey: savedMessage.conversationKey,
    },
  });
};

export const deleteSupportConversation = async (req, res) => {
  const { conversationKey } = req.params;

  if (!conversationKey) {
    throw new ApiError(400, 'Conversation key is required');
  }

  const result = await deleteSupportConversationMessages({
    role: req.auth.role,
    id: req.auth.sub,
    conversationKey,
  });

  broadcastSupportConversationDeleted({
    conversationKey: result.conversationKey,
    keys: result.keys,
    deletedBy: {
      role: req.auth.role,
      id: String(req.auth.sub),
    },
  });

  res.json({
    success: true,
    data: {
      conversationKey: result.conversationKey,
      deletedCount: result.deletedCount,
    },
  });
};
