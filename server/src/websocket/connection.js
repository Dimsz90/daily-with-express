import logger from '../utils/logger.js';
import { verifyToken } from '../services/authService.js';
import { redisClient } from '../config/redis.js';

// Connection tracking
const connections = new Map(); // socketId -> user data
const rooms = new Map();       // roomId -> Set of socketIds
const userSockets = new Map(); // userId -> Set of socketIds (untuk multi-device)

// ============================================
// CONNECTION INITIALIZATION
// ============================================

export const initializeWebSocket = (io) => {
  
  // Authentication middleware untuk Socket.io
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      
      if (!token) {
        return next(new Error('Authentication required'));
      }

      // Verify JWT token
      const decoded = verifyToken(token);
      
      // Attach user info to socket
      socket.userId = decoded.userId;
      socket.userRole = decoded.role;
      socket.userName = decoded.name;
      
      logger.info(`Socket authenticated: ${socket.userName} (${socket.id})`);
      next();
      
    } catch (error) {
      logger.error('Socket authentication failed:', error);
      next(new Error('Invalid token'));
    }
  });

  // ============================================
  // CONNECTION EVENT
  // ============================================
  
  io.on('connection', (socket) => {
    logger.info(`Client connected: ${socket.id} - User: ${socket.userName}`);

    // Store connection info
    connections.set(socket.id, {
      userId: socket.userId,
      userName: socket.userName,
      userRole: socket.userRole,
      connectedAt: new Date(),
      roomId: null,
      isActive: true
    });

    // Track user's multiple sockets (multi-device support)
    if (!userSockets.has(socket.userId)) {
      userSockets.set(socket.userId, new Set());
    }
    userSockets.get(socket.userId).add(socket.id);

    // Update user status in Redis
    updateUserStatus(socket.userId, 'online');

    // ============================================
    // ROOM EVENTS
    // ============================================

    // Join room
    socket.on('room:join', async (data) => {
      try {
        const { roomId, userName } = data;
        
        // Validation
        if (!roomId) {
          socket.emit('error', { message: 'Room ID required' });
          return;
        }

        // Leave current room if any
        if (connections.get(socket.id).roomId) {
          await leaveRoom(socket, io);
        }

        // Join new room
        socket.join(roomId);
        connections.get(socket.id).roomId = roomId;

        // Add to room tracking
        if (!rooms.has(roomId)) {
          rooms.set(roomId, new Set());
        }
        rooms.get(roomId).add(socket.id);

        // Store in Redis for persistence
        await redisClient.sAdd(`room:${roomId}:participants`, socket.userId);

        // Get all participants in room
        const participants = await getRoomParticipants(roomId);

        // Notify user
        socket.emit('room:joined', {
          roomId,
          participants,
          timestamp: new Date()
        });

        // Notify others in room
        socket.to(roomId).emit('participant:joined', {
          userId: socket.userId,
          userName: socket.userName,
          socketId: socket.id,
          timestamp: new Date()
        });

        logger.info(`User ${socket.userName} joined room ${roomId}`);

        // Send current room state
        const roomState = await getRoomState(roomId);
        socket.emit('room:state', roomState);

      } catch (error) {
        logger.error('Error joining room:', error);
        socket.emit('error', { message: 'Failed to join room' });
      }
    });

    // Leave room
    socket.on('room:leave', async () => {
      await leaveRoom(socket, io);
    });

    // ============================================
    // AUDIO/VIDEO EVENTS
    // ============================================

    // Mute/Unmute audio
    socket.on('audio:toggle', async (data) => {
      try {
        const { isMuted } = data;
        const connection = connections.get(socket.id);
        
        if (!connection.roomId) return;

        // Update connection state
        connection.audioMuted = isMuted;

        // Notify room participants
        io.to(connection.roomId).emit('participant:audio-changed', {
          userId: socket.userId,
          userName: socket.userName,
          isMuted,
          timestamp: new Date()
        });

        logger.info(`User ${socket.userName} ${isMuted ? 'muted' : 'unmuted'} audio`);

      } catch (error) {
        logger.error('Error toggling audio:', error);
      }
    });

    // ============================================
    // ADMIN/MUTOWIF EVENTS
    // ============================================

    // Kick participant (Admin only)
    socket.on('admin:kick', async (data) => {
      try {
        // Check if user is admin
        if (socket.userRole !== 'admin') {
          socket.emit('error', { message: 'Unauthorized' });
          return;
        }

        const { targetSocketId, reason } = data;
        const targetSocket = io.sockets.sockets.get(targetSocketId);

        if (!targetSocket) {
          socket.emit('error', { message: 'Participant not found' });
          return;
        }

        const targetUser = connections.get(targetSocketId);

        // Notify target user
        targetSocket.emit('kicked', {
          by: socket.userName,
          reason: reason || 'No reason provided',
          timestamp: new Date()
        });

        // Force disconnect
        await leaveRoom(targetSocket, io);
        targetSocket.disconnect(true);

        logger.warn(`Admin ${socket.userName} kicked ${targetUser.userName}`);

      } catch (error) {
        logger.error('Error kicking participant:', error);
      }
    });

    // Mute participant (Admin only)
    socket.on('admin:mute', async (data) => {
      try {
        if (socket.userRole !== 'admin') {
          socket.emit('error', { message: 'Unauthorized' });
          return;
        }

        const { targetSocketId } = data;
        const targetSocket = io.sockets.sockets.get(targetSocketId);

        if (!targetSocket) return;

        // Notify target to mute
        targetSocket.emit('forced-mute', {
          by: socket.userName,
          timestamp: new Date()
        });

        logger.info(`Admin ${socket.userName} muted participant ${targetSocketId}`);

      } catch (error) {
        logger.error('Error muting participant:', error);
      }
    });

    // ============================================
    // EMERGENCY/SOS EVENTS
    // ============================================

    socket.on('emergency:alert', async (data) => {
      try {
        const { location, message } = data;
        const connection = connections.get(socket.id);

        if (!connection.roomId) return;

        // Store emergency in Redis
        const emergencyData = {
          userId: socket.userId,
          userName: socket.userName,
          location,
          message,
          timestamp: new Date(),
          roomId: connection.roomId
        };

        await redisClient.lPush(
          'emergencies:active',
          JSON.stringify(emergencyData)
        );

        // Notify all admins in room
        const roomSockets = rooms.get(connection.roomId);
        if (roomSockets) {
          for (const sid of roomSockets) {
            const conn = connections.get(sid);
            if (conn?.userRole === 'admin') {
              io.to(sid).emit('emergency:received', emergencyData);
            }
          }
        }

        // Confirm to sender
        socket.emit('emergency:sent', {
          status: 'received',
          timestamp: new Date()
        });

        logger.warn(`Emergency alert from ${socket.userName}:`, emergencyData);

      } catch (error) {
        logger.error('Error handling emergency:', error);
      }
    });

    // ============================================
    // HEARTBEAT / PING-PONG
    // ============================================

    socket.on('ping', (callback) => {
      const connection = connections.get(socket.id);
      if (connection) {
        connection.lastPing = new Date();
        if (typeof callback === 'function') {
          callback({ pong: true, timestamp: Date.now() });
        }
      }
    });

    // ============================================
    // DISCONNECT EVENT
    // ============================================

    socket.on('disconnect', async (reason) => {
      logger.info(`Client disconnected: ${socket.id} - Reason: ${reason}`);

      try {
        // Leave room if in one
        await leaveRoom(socket, io);

        // Remove from user sockets
        const userSocketSet = userSockets.get(socket.userId);
        if (userSocketSet) {
          userSocketSet.delete(socket.id);
          
          // If user has no more active sockets, mark as offline
          if (userSocketSet.size === 0) {
            await updateUserStatus(socket.userId, 'offline');
            userSockets.delete(socket.userId);
          }
        }

        // Remove from connections
        connections.delete(socket.id);

      } catch (error) {
        logger.error('Error handling disconnect:', error);
      }
    });

    // ============================================
    // ERROR HANDLING
    // ============================================

    socket.on('error', (error) => {
      logger.error(`Socket error for ${socket.id}:`, error);
    });

  });

  // ============================================
  // PERIODIC CLEANUP
  // ============================================

  // Clean up stale connections every 5 minutes
  setInterval(() => {
    cleanupStaleConnections(io);
  }, 5 * 60 * 1000);

  logger.info('WebSocket server initialized');
};

// ============================================
// HELPER FUNCTIONS
// ============================================

async function leaveRoom(socket, io) {
  const connection = connections.get(socket.id);
  
  if (!connection?.roomId) return;

  const roomId = connection.roomId;

  try {
    // Leave Socket.io room
    socket.leave(roomId);

    // Remove from room tracking
    if (rooms.has(roomId)) {
      rooms.get(roomId).delete(socket.id);
      
      // Delete room if empty
      if (rooms.get(roomId).size === 0) {
        rooms.delete(roomId);
        logger.info(`Room ${roomId} deleted (empty)`);
      }
    }

    // Remove from Redis
    await redisClient.sRem(`room:${roomId}:participants`, socket.userId);

    // Notify others
    io.to(roomId).emit('participant:left', {
      userId: socket.userId,
      userName: socket.userName,
      timestamp: new Date()
    });

    // Update connection
    connection.roomId = null;

    logger.info(`User ${socket.userName} left room ${roomId}`);

  } catch (error) {
    logger.error('Error leaving room:', error);
  }
}

async function getRoomParticipants(roomId) {
  try {
    const socketIds = rooms.get(roomId);
    if (!socketIds) return [];

    const participants = [];
    for (const socketId of socketIds) {
      const conn = connections.get(socketId);
      if (conn) {
        participants.push({
          userId: conn.userId,
          userName: conn.userName,
          userRole: conn.userRole,
          socketId: socketId,
          audioMuted: conn.audioMuted || false
        });
      }
    }

    return participants;
  } catch (error) {
    logger.error('Error getting room participants:', error);
    return [];
  }
}

async function getRoomState(roomId) {
  try {
    const participants = await getRoomParticipants(roomId);
    const participantCount = participants.length;

    return {
      roomId,
      participants,
      participantCount,
      timestamp: new Date()
    };
  } catch (error) {
    logger.error('Error getting room state:', error);
    return null;
  }
}

async function updateUserStatus(userId, status) {
  try {
    await redisClient.hSet(`user:${userId}`, {
      status,
      lastSeen: new Date().toISOString()
    });

    // Set expiry for 30 minutes
    await redisClient.expire(`user:${userId}`, 1800);
  } catch (error) {
    logger.error('Error updating user status:', error);
  }
}

async function cleanupStaleConnections(io) {
  const now = Date.now();
  const STALE_THRESHOLD = 5 * 60 * 1000; // 5 minutes

  for (const [socketId, connection] of connections) {
    // Check if connection is stale
    const lastActivity = connection.lastPing || connection.connectedAt;
    const timeSinceActivity = now - lastActivity.getTime();

    if (timeSinceActivity > STALE_THRESHOLD) {
      logger.warn(`Cleaning up stale connection: ${socketId}`);
      
      const socket = io.sockets.sockets.get(socketId);
      if (socket) {
        socket.disconnect(true);
      }
      
      connections.delete(socketId);
    }
  }

  logger.info(`Connection cleanup complete. Active: ${connections.size}`);
}

// ============================================
// MONITORING / STATISTICS
// ============================================

export function getConnectionStats() {
  return {
    totalConnections: connections.size,
    totalRooms: rooms.size,
    totalUsers: userSockets.size,
    connections: Array.from(connections.entries()).map(([id, conn]) => ({
      socketId: id,
      userId: conn.userId,
      userName: conn.userName,
      roomId: conn.roomId,
      connectedAt: conn.connectedAt
    })),
    rooms: Array.from(rooms.entries()).map(([id, sockets]) => ({
      roomId: id,
      participantCount: sockets.size
    }))
  };
}
