import { io } from 'socket.io-client';
import { API_BASE_URL } from './api.js';

const DASHBOARD_KEY = import.meta.env.VITE_DASHBOARD_API_KEY || '';

/**
 * Create the realtime connection.
 *
 * Events emitted by the backend:
 *   server:hello  -> handshake info (device id/name, offline timeout)
 *   location:new  -> { location, device, server_time }
 *   device:status -> { device, server_time }
 */
export function createSocket() {
  return io(API_BASE_URL || window.location.origin, {
    path: '/socket.io',
    auth: DASHBOARD_KEY ? { token: DASHBOARD_KEY } : {},
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 8000,
    timeout: 8000,
  });
}
