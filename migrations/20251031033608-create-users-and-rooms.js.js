export async function up(queryInterface, Sequelize) {
  // Create Users table
  await queryInterface.createTable('users', {
    id: {
      type: Sequelize.UUID,
      defaultValue: Sequelize.UUIDV4,
      primaryKey: true
    },
    name: {
      type: Sequelize.STRING(255),
      allowNull: false
    },
    email: {
      type: Sequelize.STRING(255),
      allowNull: false,
      unique: true
    },
    password: {
      type: Sequelize.STRING(255),
      allowNull: false
    },
    no_ktp: {
      type: Sequelize.STRING(16),
      allowNull: false,
      unique: true
    },
    no_handphone: {
      type: Sequelize.STRING(15),
      allowNull: false
    },
    alamat: {
      type: Sequelize.TEXT,
      allowNull: false
    },
    role: {
      type: Sequelize.ENUM('admin', 'jamaah'),
      defaultValue: 'jamaah',
      allowNull: false
    },
    jamaah: {
      type: Sequelize.STRING(50),
      defaultValue: 'STI',
      allowNull: false
    },
    status: {
      type: Sequelize.ENUM('active', 'inactive', 'suspended'),
      defaultValue: 'active',
      allowNull: false
    },
    email_verified: {
      type: Sequelize.BOOLEAN,
      defaultValue: false
    },
    email_verified_at: {
      type: Sequelize.DATE,
      allowNull: true
    },
    verification_token: {
      type: Sequelize.STRING(255),
      allowNull: true
    },
    reset_password_token: {
      type: Sequelize.STRING(255),
      allowNull: true
    },
    reset_password_expires: {
      type: Sequelize.DATE,
      allowNull: true
    },
    last_login_at: {
      type: Sequelize.DATE,
      allowNull: true
    },
    last_login_ip: {
      type: Sequelize.STRING(45),
      allowNull: true
    },
    created_at: {
      type: Sequelize.DATE,
      allowNull: false
    },
    updated_at: {
      type: Sequelize.DATE,
      allowNull: false
    },
    deleted_at: {
      type: Sequelize.DATE,
      allowNull: true
    }
  });

  // Create Rooms table
  await queryInterface.createTable('rooms', {
    id: {
      type: Sequelize.UUID,
      defaultValue: Sequelize.UUIDV4,
      primaryKey: true
    },
    name: {
      type: Sequelize.STRING(100),
      allowNull: false,
      unique: true
    },
    display_name: {
      type: Sequelize.STRING(255),
      allowNull: true
    },
    description: {
      type: Sequelize.TEXT,
      allowNull: true
    },
    daily_room_url: {
      type: Sequelize.STRING(255),
      allowNull: false,
      unique: true
    },
    daily_room_id: {
      type: Sequelize.STRING(100),
      allowNull: true
    },
    max_participants: {
      type: Sequelize.INTEGER,
      defaultValue: 50
    },
    is_private: {
      type: Sequelize.BOOLEAN,
      defaultValue: true
    },
    enable_chat: {
      type: Sequelize.BOOLEAN,
      defaultValue: true
    },
    enable_recording: {
      type: Sequelize.BOOLEAN,
      defaultValue: false
    },
    enable_screenshare: {
      type: Sequelize.BOOLEAN,
      defaultValue: false
    },
    status: {
      type: Sequelize.ENUM('active', 'inactive', 'archived'),
      defaultValue: 'active'
    },
    owner_id: {
      type: Sequelize.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT'
    },
    jamaah_group: {
      type: Sequelize.STRING(50),
      allowNull: true
    },
    total_sessions: {
      type: Sequelize.INTEGER,
      defaultValue: 0
    },
    total_participants: {
      type: Sequelize.INTEGER,
      defaultValue: 0
    },
    last_active_at: {
      type: Sequelize.DATE,
      allowNull: true
    },
    expires_at: {
      type: Sequelize.DATE,
      allowNull: true
    },
    created_at: {
      type: Sequelize.DATE,
      allowNull: false
    },
    updated_at: {
      type: Sequelize.DATE,
      allowNull: false
    },
    deleted_at: {
      type: Sequelize.DATE,
      allowNull: true
    }
  });

  // Add indexes
  await queryInterface.addIndex('users', ['email']);
  await queryInterface.addIndex('users', ['no_ktp']);
  await queryInterface.addIndex('users', ['role']);
  await queryInterface.addIndex('users', ['jamaah']);
  
  await queryInterface.addIndex('rooms', ['name']);
  await queryInterface.addIndex('rooms', ['owner_id']);
  await queryInterface.addIndex('rooms', ['status']);
}

export async function down(queryInterface, Sequelize) {
  await queryInterface.dropTable('rooms');
  await queryInterface.dropTable('users');
}