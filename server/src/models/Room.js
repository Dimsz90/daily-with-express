// ============================================
// ROOM MODEL
// src/models/Room.js
// ============================================

import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';

const Room = sequelize.define('Room', {
  // ============================================
  // PRIMARY KEY
  // ============================================
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
    comment: 'Unique identifier untuk room'
  },

  // ============================================
  // ROOM INFO
  // ============================================
  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: {
      name: 'unique_room_name',
      msg: 'Room name already exists'
    },
    validate: {
      notEmpty: { msg: 'Room name cannot be empty' },
      is: {
        args: /^[a-zA-Z0-9-_]+$/,
        msg: 'Room name can only contain alphanumeric, dash, and underscore'
      }
    },
    comment: 'Room name (URL-friendly)'
  },

  displayName: {
    type: DataTypes.STRING(255),
    allowNull: true,
    field: 'display_name',
    comment: 'Display name for UI'
  },

  description: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Room description'
  },

  // ============================================
  // DAILY.CO INFO
  // ============================================
  dailyRoomUrl: {
    type: DataTypes.STRING(255),
    allowNull: false,
    unique: true,
    field: 'daily_room_url',
    comment: 'Daily.co room URL'
  },

  dailyRoomId: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'daily_room_id',
    comment: 'Daily.co room ID'
  },

  // ============================================
  // ROOM SETTINGS
  // ============================================
  maxParticipants: {
    type: DataTypes.INTEGER,
    defaultValue: 50,
    field: 'max_participants',
    validate: {
      min: {
        args: [2],
        msg: 'Max participants must be at least 2'
      },
      max: {
        args: [200],
        msg: 'Max participants cannot exceed 200'
      }
    },
    comment: 'Maximum number of participants'
  },

  isPrivate: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'is_private',
    comment: 'Whether room is private (requires token)'
  },

  enableChat: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'enable_chat',
    comment: 'Enable text chat in room'
  },

  enableRecording: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'enable_recording',
    comment: 'Enable cloud recording'
  },

  enableScreenshare: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'enable_screenshare',
    comment: 'Enable screen sharing'
  },

  // ============================================
  // STATUS
  // ============================================
  status: {
    type: DataTypes.ENUM('active', 'inactive', 'archived'),
    defaultValue: 'active',
    allowNull: false,
    comment: 'Room status'
  },

  // ============================================
  // OWNERSHIP
  // ============================================
  ownerId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'owner_id',
    references: {
      model: 'users',
      key: 'id'
    },
    comment: 'User who created the room'
  },

  jamaahGroup: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'jamaah_group',
    comment: 'Jamaah group this room belongs to'
  },

  // ============================================
  // STATISTICS
  // ============================================
  totalSessions: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'total_sessions',
    comment: 'Total number of sessions held'
  },

  totalParticipants: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'total_participants',
    comment: 'Total participants across all sessions'
  },

  lastActiveAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'last_active_at',
    comment: 'Last time room was active'
  },

  // ============================================
  // EXPIRY
  // ============================================
  expiresAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'expires_at',
    comment: 'Room expiry date (Daily.co limitation)'
  },

  // ============================================
  // TIMESTAMPS
  // ============================================
  createdAt: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'created_at'
  },

  updatedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'updated_at'
  },

  deletedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'deleted_at'
  }

}, {
  // ============================================
  // MODEL OPTIONS
  // ============================================
  tableName: 'rooms',
  timestamps: true,
  paranoid: true,
  underscored: true,

  // Indexes
  indexes: [
    {
      unique: true,
      fields: ['name']
    },
    {
      unique: true,
      fields: ['daily_room_url']
    },
    {
      fields: ['status']
    },
    {
      fields: ['owner_id']
    },
    {
      fields: ['jamaah_group']
    },
    {
      fields: ['expires_at']
    }
  ],

  // ============================================
  // HOOKS
  // ============================================
  hooks: {
    // Before create - set display name if not provided
    beforeCreate: (room) => {
      if (!room.displayName) {
        room.displayName = room.name.replace(/-/g, ' ')
          .replace(/\b\w/g, l => l.toUpperCase());
      }
    },

    // After create - increment owner's room count
    afterCreate: async (room) => {
      // You can add statistics tracking here
      console.log(`Room created: ${room.name}`);
    }
  }
});

// ============================================
// INSTANCE METHODS
// ============================================

// Check if room is active
Room.prototype.isActive = function() {
  return this.status === 'active' && 
         (!this.expiresAt || this.expiresAt > new Date());
};

// Check if room is full
Room.prototype.isFull = function(currentParticipants) {
  return currentParticipants >= this.maxParticipants;
};

// Update activity
Room.prototype.updateActivity = async function(participantCount) {
  this.lastActiveAt = new Date();
  this.totalSessions += 1;
  this.totalParticipants += participantCount;
  await this.save();
};

// Get room config for Daily.co
Room.prototype.getDailyConfig = function() {
  return {
    name: this.name,
    privacy: this.isPrivate ? 'private' : 'public',
    properties: {
      enable_chat: this.enableChat,
      enable_recording: this.enableRecording ? 'cloud' : 'off',
      enable_screenshare: this.enableScreenshare,
      max_participants: this.maxParticipants
    }
  };
};

// Get public info
Room.prototype.toPublicJSON = function() {
  const values = { ...this.get() };
  
  // Remove sensitive/internal fields if needed
  return values;
};

// ============================================
// CLASS/STATIC METHODS
// ============================================

// Find by name
Room.findByName = async function(name) {
  return await this.findOne({ where: { name } });
};

// Find active rooms
Room.findActiveRooms = async function() {
  return await this.findAll({
    where: { 
      status: 'active'
    }
  });
};

// Find rooms by owner
Room.findByOwner = async function(ownerId) {
  return await this.findAll({
    where: { ownerId }
  });
};

// Find rooms by jamaah group
Room.findByJamaahGroup = async function(jamaahGroup) {
  return await this.findAll({
    where: { jamaahGroup }
  });
};

// Find expired rooms
Room.findExpiredRooms = async function() {
  const now = new Date();
  return await this.findAll({
    where: {
      expiresAt: {
        [sequelize.Sequelize.Op.lt]: now
      }
    }
  });
};

export default Room;
