import express from 'express';
import { body, param, validationResult } from 'express-validator';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import * as dailyService from '../services/dailyService.js';
import { getConnectionStats } from '../websocket/connection.js';
import logger from '../utils/logger.js';

const router = express.Router();

// GET /api/v1/room/list - List all rooms (Admin only)
router.get('/list', 
  authenticate, 
  requireAdmin,
  async (req, res, next) => {
    try {
      const rooms = await dailyService.listRooms();
      res.json({ rooms });
    } catch (error) {
      logger.error('Failed to list rooms:', error);
      next(error);
    }
  }
);

// POST /api/v1/room/create - Create new room (Admin only)
router.post('/create',
  authenticate,
  requireAdmin,
  [
    body('roomName')
      .trim()
      .notEmpty()
      .matches(/^[a-zA-Z0-9-_]+$/)
      .withMessage('Invalid room name format'),
    body('maxParticipants')
      .optional()
      .isInt({ min: 2, max: 200 })
      .withMessage('Max participants must be between 2-200')
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ 
          error: 'Validation failed', 
          details: errors.array() 
        });
      }

      const { roomName, maxParticipants } = req.body;

      const room = await dailyService.createRoom(roomName, {
        maxParticipants: maxParticipants || 50
      });

      logger.info(`Room created by ${req.user.name}: ${roomName}`);

      res.status(201).json({
        message: 'Room created successfully',
        room
      });

    } catch (error) {
      logger.error('Failed to create room:', error);
      next(error);
    }
  }
);

// GET /api/v1/room/:roomName - Get room info
router.get('/:roomName',
  authenticate,
  [
    param('roomName')
      .trim()
      .notEmpty()
  ],
  async (req, res, next) => {
    try {
      const { roomName } = req.params;
      const room = await dailyService.getRoomInfo(roomName);
      
      res.json({ room });
    } catch (error) {
      if (error.response?.status === 404) {
        return res.status(404).json({ error: 'Room not found' });
      }
      next(error);
    }
  }
);

// DELETE /api/v1/room/:roomName - Delete room (Admin only)
router.delete('/:roomName',
  authenticate,
  requireAdmin,
  [
    param('roomName')
      .trim()
      .notEmpty()
  ],
  async (req, res, next) => {
    try {
      const { roomName } = req.params;
      await dailyService.deleteRoom(roomName);
      
      logger.info(`Room deleted by ${req.user.name}: ${roomName}`);
      
      res.json({ 
        message: 'Room deleted successfully',
        roomName 
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/v1/room/stats/connections - Get real-time connection stats
router.get('/stats/connections',
  authenticate,
  requireAdmin,
  (req, res) => {
    const stats = getConnectionStats();
    res.json(stats);
  }
);

// GET /api/v1/room/meetings/active - Get active meetings
router.get('/meetings/active',
  authenticate,
  requireAdmin,
  async (req, res, next) => {
    try {
      const meetings = await dailyService.getActiveMeetings();
      res.json({ meetings });
    } catch (error) {
      next(error);
    }
  }
);

export default router;