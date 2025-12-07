import { DataTypes } from 'sequelize';
import bcrypt from 'bcryptjs';
import sequelize from '../database/connection.js';

const User = sequelize.define('User', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notEmpty: {
        msg: 'Name is required',
      },
    },
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: {
      isEmail: {
        msg: 'Please provide a valid email',
      },
      notEmpty: {
        msg: 'Email is required',
      },
    },
  },
  password_hash: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notEmpty: {
        msg: 'Password is required',
      },
    },
    // Note: Password length validation is done in the API route, not here
    // because password_hash will be a bcrypt hash (60 chars) after hashing
  },
  role: {
    type: DataTypes.ENUM('super_admin', 'secretary', 'official'),
    defaultValue: 'official',
    allowNull: false,
    validate: {
      isIn: {
        args: [['super_admin', 'secretary', 'official']],
        msg: 'Role must be super_admin, secretary, or official',
      },
    },
  },
  department: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  // createdAt and updatedAt are handled automatically by Sequelize with underscored: true
}, {
  tableName: 'users',
  hooks: {
    beforeCreate: async (user) => {
      if (user.password_hash) {
        user.password_hash = await bcrypt.hash(user.password_hash, 10);
      }
    },
    beforeUpdate: async (user) => {
      if (user.changed('password_hash')) {
        user.password_hash = await bcrypt.hash(user.password_hash, 10);
      }
    },
  },
});

// Instance method to compare password
User.prototype.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password_hash);
};

// Instance method to remove password from JSON
User.prototype.toJSON = function () {
  const values = { ...this.get() };
  delete values.password_hash;
  return values;
};

export default User;
