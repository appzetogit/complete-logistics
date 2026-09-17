import api from '../../../shared/api/axiosInstance';

export const supportTicketService = {
  getTitles: (userType) =>
    api.get('/support/titles', {
      params: userType ? { userType } : {},
    }),

  createTicket: (payload) => api.post('/support/tickets', payload),
  listMyTickets: (params = {}) => api.get('/support/tickets/my', { params }),
  getMyTicket: (ticketCode) => api.get(`/support/tickets/${encodeURIComponent(ticketCode)}`),
  replyMyTicket: (ticketCode, payload) =>
    api.post(`/support/tickets/${encodeURIComponent(ticketCode)}/reply`, payload),
};

export const adminSupportService = {
  listTitles: () => api.get('/admin/support/titles'),
  createTitle: (payload) => api.post('/admin/support/titles', payload),
  updateTitle: (titleId, payload) =>
    api.patch(`/admin/support/titles/${encodeURIComponent(titleId)}`, payload),
  deleteTitle: (titleId) => api.delete(`/admin/support/titles/${encodeURIComponent(titleId)}`),

  getTicketStats: () => api.get('/admin/support/tickets/stats'),
  listTickets: (params = {}) => api.get('/admin/support/tickets', { params }),
  getTicket: (ticketCode) => api.get(`/admin/support/tickets/${encodeURIComponent(ticketCode)}`),
  updateTicket: (ticketCode, payload) =>
    api.patch(`/admin/support/tickets/${encodeURIComponent(ticketCode)}`, payload),
  replyTicket: (ticketCode, payload) =>
    api.post(`/admin/support/tickets/${encodeURIComponent(ticketCode)}/reply`, payload),
};
