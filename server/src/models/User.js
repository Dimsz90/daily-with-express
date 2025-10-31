import { DataTypes } from 'sequelize';
import bcrypt from 'bcryptjs';
import { sequelize } from '../config/database.js';

const User = sequelize.define('User', {
  // ============================================
  // PRIMARY KEY
  // ============================================
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
    comment: 'Unique identifier untuk user'
  },

  // ============================================
  // BASIC INFO
  // ============================================
  name: {
    type: DataTypes.STRING(255),
    allowNull: false,
    validate: {
      notEmpty: { msg: 'Name cannot be empty' },
      len: {
        args: [2, 255],
        msg: 'Name must be between 2-255 characters'
      }
    },
    comment: 'Nama lengkap user'
  },

  email: {
    type: DataTypes.STRING(255),
    allowNull: false,
    unique: {
      name: 'unique_email',
      msg: 'Email already registered'
    },
    validate: {
      isEmail: { msg: 'Invalid email format' },
      notEmpty: { msg: 'Email cannot be empty' }
    },
    comment: 'Email address (unique)'
  },

  password: {
    type: DataTypes.STRING(255),
    allowNull: false,
    validate: {
      notEmpty: { msg: 'Password cannot be empty' },
      len: {
        args: [6, 255],
        msg: 'Password must be at least 6 characters'
      }
    },
    comment: 'Hashed password'
  },

  // ============================================
  // CONTACT INFO (Sesuai Laravel Anda)
  // ============================================
  no_ktp: {
    type: DataTypes.STRING(16),
    allowNull: false,
    unique: {
      name: 'unique_ktp',
      msg: 'KTP number already registered'
    },
    validate: {
      isNumeric: { msg: 'KTP must be numeric' },
      len: {
        args: [16, 16],
        msg: 'KTP must be exactly 16 digits'
      }
    },
    comment: 'Nomor KTP (ID Card)'
  },

  no_handphone: {
    type: DataTypes.STRING(15),
    allowNull: false,
    validate: {
      notEmpty: { msg: 'Phone number cannot be empty' },
      is: {
        args: /^[0-9+\-\s()]+$/,
        msg: 'Invalid phone number format'
      }
    },
    comment: 'Nomor handphone'
  },

  alamat: {
    type: DataTypes.TEXT,
    allowNull: false,
    validate: {
      notEmpty: { msg: 'Address cannot be empty' }
    },
    comment: 'Alamat lengkap'
  },

  // ============================================
  // ROLE & STATUS
  // ============================================
  role: {
    type: DataTypes.ENUM('admin', 'jamaah'),
    defaultValue: 'jamaah',
    allowNull: false,
    comment: 'User role: admin (mutowif) or jamaah'
  },

  jamaah: {
    type: DataTypes.STRING(50),
    defaultValue: 'STI',
    allowNull: false,
    comment: 'Nama travel/kelompok jamaah'
  },

  status: {
    type: DataTypes.ENUM('active', 'inactive', 'suspended'),
    defaultValue: 'active',
    allowNull: false,
    comment: 'Account status'
  },

  // ============================================
  // VERIFICATION
  // ============================================
  emailVerified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'email_verified',
    comment: 'Email verification status'
  },

  emailVerifiedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'email_verified_at',
    comment: 'Email verification timestamp'
  },

  verificationToken: {
    type: DataTypes.STRING(255),
    allowNull: true,
    field: 'verification_token',
    comment: 'Token for email verification'
  },

  // ============================================
  // PASSWORD RESET
  // ============================================
  resetPasswordToken: {
    type: DataTypes.STRING(255),
    allowNull: true,
    field: 'reset_password_token',
    comment: 'Token for password reset'
  },

  resetPasswordExpires: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'reset_password_expires',
    comment: 'Expiry time for reset token'
  },

  // ============================================
  // TRACKING
  // ============================================
  lastLoginAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'last_login_at',
    comment: 'Last login timestamp'
  },

  lastLoginIp: {
    type: DataTypes.STRING(45),
    allowNull: true,
    field: 'last_login_ip',
    comment: 'Last login IP address'
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
    field: 'deleted_at',
    comment: 'Soft delete timestamp'
  }

}, {
  // ============================================
  // MODEL OPTIONS
  // ============================================
  tableName: 'users',
  timestamps: true,
  paranoid: true, // Soft delete
  underscored: true, // Use snake_case for fields
  
  // Indexes for performance
  indexes: [
    {
      unique: true,
      fields: ['email']
    },
    {
      unique: true,
      fields: ['no_ktp']
    },
    {
      fields: ['role']
    },
    {
      fields: ['status']
    },
    {
      fields: ['jamaah']
    }
  ],

  // ============================================
  // HOOKS (Lifecycle methods)
  // ============================================
  hooks: {
    // Before create - hash password
    beforeCreate: async (user) => {
      if (user.password) {
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(user.password, salt);
      }
    },

    // Before update - hash password if changed
    beforeUpdate: async (user) => {
      if (user.changed('password')) {
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(user.password, salt);
      }
    },

    // Before find - exclude deleted if not explicitly included
    beforeFind: (options) => {
      if (!options.paranoid) {
        options.where = options.where || {};
        options.where.deletedAt = null;
      }
    }
  }
});

// ============================================
// INSTANCE METHODS
// ============================================

// Compare password
User.prototype.comparePassword = async function(candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    throw new Error('Password comparison failed');
  }
};

// Get public profile (exclude sensitive data)
User.prototype.toPublicJSON = function() {
  const values = { ...this.get() };
  
  // Remove sensitive fields
  delete values.password;
  delete values.resetPasswordToken;
  delete values.resetPasswordExpires;
  delete values.verificationToken;
  
  return values;
};

// Check if user is admin
User.prototype.isAdmin = function() {
  return this.role === 'admin';
};

// Check if user is active
User.prototype.isActive = function() {
  return this.status === 'active';
};

// Update last login
User.prototype.updateLastLogin = async function(ipAddress) {
  this.lastLoginAt = new Date();
  this.lastLoginIp = ipAddress;
  await this.save();
};

// ============================================
// CLASS/STATIC METHODS
// ============================================

// Find by email
User.findByEmail = async function(email) {
  return await this.findOne({ where: { email } });
};

// Find by KTP
User.findByKTP = async function(no_ktp) {
  return await this.findOne({ where: { no_ktp } });
};

// Find active users
User.findActiveUsers = async function() {
  return await this.findAll({
    where: { status: 'active' }
  });
};

// Find by jamaah group
User.findByJamaah = async function(jamaahName) {
  return await this.findAll({
    where: { jamaah: jamaahName }
  });
};

// Get admins
User.getAdmins = async function() {
  return await this.findAll({
    where: { role: 'admin', status: 'active' }
  });
};

export default User;


