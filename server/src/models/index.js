import User from './User.js';
import Room from './Room.js';

// User has many Rooms (as owner)
User.hasMany(Room, {
  foreignKey: 'ownerId',
  as: 'ownedRooms'
});

// Room belongs to User (owner)
Room.belongsTo(User, {
  foreignKey: 'ownerId',
  as: 'owner'
});

// Export all models
export { User, Room };