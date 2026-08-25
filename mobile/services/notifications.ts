import api from './api';
import { Notification } from '@/types';

interface NotificationsResponse {
  notifications: Notification[];
  unread_count: number;
}

export const notificationService = {
  async getNotifications() {
    const res = await api.get<NotificationsResponse>('/auth/notifications/');
    return res.data;
  },

  async markAllRead() {
    const res = await api.patch('/auth/notifications/', {});
    return res.data;
  },

  async markRead(id: number) {
    const res = await api.patch(`/auth/notifications/${id}/`, {});
    return res.data;
  },

  async deleteNotification(id: number) {
    const res = await api.delete(`/auth/notifications/${id}/`);
    return res.data;
  },
};
