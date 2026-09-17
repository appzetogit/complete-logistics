import api from '../../../shared/api/axiosInstance';

const withToken = (token) => (token ? { headers: { Authorization: `Bearer ${token}` } } : undefined);

export const getSupportConversations = (token) => api.get('/chats/conversations', withToken(token));

export const getSupportMessages = (conversationKey, token) =>
  api.get(`/chats/messages/${encodeURIComponent(conversationKey)}`, withToken(token));

export const sendSupportMessage = (payload, token) =>
  api.post('/chats/messages', payload, withToken(token));

export const markSupportMessagesRead = (conversationKey, token) =>
  api.patch(`/chats/messages/${encodeURIComponent(conversationKey)}/read`, undefined, withToken(token));

export const deleteSupportConversation = (conversationKey, token) =>
  api.delete(`/chats/messages/${encodeURIComponent(conversationKey)}`, withToken(token));
