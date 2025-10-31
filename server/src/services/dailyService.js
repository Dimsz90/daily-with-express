import axios from 'axios';
import logger from '../utils/logger.js';
import { redisClient } from '../config/redis.js';

const DAILY_API_BASE = 'https://api.daily.co/v1';
const DAILY_API_KEY = process.env.DAILY_API_KEY;

// Configure axios instance
const dailyAPI = axios.create({
  baseURL: DAILY_API_BASE,
  headers: {
    'Authorization': `Bearer ${DAILY_API_KEY}`,
    'Content-Type': 'application/json'
  },
  timeout: 10000
});

// Request interceptor for logging
dailyAPI.interceptors.request.use(
  (config) => {
    logger.debug(`Daily.co API Request: ${config.method.toUpperCase()} ${config.url}`);
    return config;
  },
  (error) => {
    logger.error('Daily.co API Request Error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor
dailyAPI.interceptors.response.use(
  (response) => {
    logger.debug(`Daily.co API Response: ${response.status}`);
    return response;
  },
  (error) => {
    const message = error.response?.data?.error || error.message;
    logger.error('Daily.co API Error:', message);
    return Promise.reject(error);
  }
);

// ============================================
// TOKEN GENERATION (WITH CACHING)
// ============================================

export async function generateMeetingToken(roomName, userId, userRole) {
  try {
    // Check cache first (tokens valid for 1 hour)
    const cacheKey = `token:${roomName}:${userId}:${userRole}`;
    const cachedToken = await redisClient.get(cacheKey);

    if (cachedToken) {
      logger.info(`Using cached token for user ${userId}`);
      return cachedToken;
    }

    // Generate new token
    const isOwner = userRole === 'admin';
    const expirationTime = Math.floor(Date.now() / 1000) + 3600; // 1 hour

    const response = await dailyAPI.post('/meeting-tokens', {
      properties: {
        room_name: roomName,
        user_name: userId,
        is_owner: isOwner,
        enable_recording: false,
        start_video_off: true,
        start_audio_off: false,
        exp: expirationTime,
        // Permissions
        ...(isOwner ? {
          enable_prejoin_ui: false,
          enable_recording: true,
          enable_screenshare: true
        } : {
          enable_prejoin_ui: true,
          enable_recording: false,
          enable_screenshare: false
        })
      }
    });

    const token = response.data.token;

    // Cache token (expire in 50 minutes to be safe)
    await redisClient.setEx(cacheKey, 3000, token);

    logger.info(`Generated new token for user ${userId} (owner: ${isOwner})`);
    
    return token;

  } catch (error) {
    logger.error('Failed to generate meeting token:', error);
    throw new Error('Token generation failed');
  }
}

// ============================================
// ROOM MANAGEMENT
// ============================================

export async function createRoom(roomName, config = {}) {
  try {
    const response = await dailyAPI.post('/rooms', {
      name: roomName,
      privacy: 'private',
      properties: {
        enable_chat: true,
        enable_screenshare: true,
        enable_knocking: false,
        start_video_off: true,
        start_audio_off: false,
        max_participants: config.maxParticipants || 50,
        enable_recording: 'cloud',
        exp: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60), // 30 days
        ...config
      }
    });

    logger.info(`Room created: ${roomName}`);
    return response.data;

  } catch (error) {
    // Room might already exist
    if (error.response?.status === 400) {
      logger.info(`Room ${roomName} already exists`);
      return await getRoomInfo(roomName);
    }
    throw error;
  }
}

export async function getRoomInfo(roomName) {
  try {
    const response = await dailyAPI.get(`/rooms/${roomName}`);
    return response.data;
  } catch (error) {
    logger.error(`Failed to get room info: ${roomName}`, error);
    throw error;
  }
}

export async function deleteRoom(roomName) {
  try {
    await dailyAPI.delete(`/rooms/${roomName}`);
    logger.info(`Room deleted: ${roomName}`);
    return { success: true };
  } catch (error) {
    logger.error(`Failed to delete room: ${roomName}`, error);
    throw error;
  }
}

export async function listRooms() {
  try {
    const response = await dailyAPI.get('/rooms');
    return response.data.data;
  } catch (error) {
    logger.error('Failed to list rooms', error);
    throw error;
  }
}

// ============================================
// MEETING MANAGEMENT
// ============================================

export async function getActiveMeetings() {
  try {
    const response = await dailyAPI.get('/meetings');
    return response.data.data;
  } catch (error) {
    logger.error('Failed to get active meetings', error);
    throw error;
  }
}

export async function getMeetingInfo(meetingId) {
  try {
    const response = await dailyAPI.get(`/meetings/${meetingId}`);
    return response.data;
  } catch (error) {
    logger.error(`Failed to get meeting info: ${meetingId}`, error);
    throw error;
  }
}

// ============================================
// PARTICIPANT MANAGEMENT
// ============================================

export async function ejectParticipant(meetingId, participantId) {
  try {
    const response = await dailyAPI.post(`/meetings/${meetingId}/participants/${participantId}/eject`);
    logger.info(`Ejected participant ${participantId} from meeting ${meetingId}`);
    return response.data;
  } catch (error) {
    logger.error('Failed to eject participant', error);
    throw error;
  }
}
