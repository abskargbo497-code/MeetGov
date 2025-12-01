# MongoDB to MySQL Migration Guide

This document describes the changes made to convert the project from MongoDB to MySQL.

## Changes Summary

### Dependencies
- **Removed:** `mongoose`
- **Added:** `sequelize`, `mysql2`

### Database Connection
- **Before:** MongoDB connection via Mongoose
- **After:** MySQL connection via Sequelize

### Models
- **Before:** Mongoose schemas with ObjectId references
- **After:** Sequelize models with INTEGER foreign keys

### Query Methods
- `Model.findById()` → `Model.findByPk()`
- `Model.find()` → `Model.findAll()`
- `Model.findOne({ field: value })` → `Model.findOne({ where: { field: value } })`
- `new Model()` + `save()` → `Model.create()`
- `Model.populate()` → `Model.findAll({ include: [...] })`
- `_id` → `id` (INTEGER instead of ObjectId)
- `$lt`, `$gte`, `$in` → `Op.lt`, `Op.gte`, `Op.in`

## Key Differences

### IDs
- **MongoDB:** ObjectId (string)
- **MySQL:** INTEGER (auto-increment)

### References
- **MongoDB:** ObjectId references
- **MySQL:** INTEGER foreign keys

### Queries
- **MongoDB:** `{ field: value }` or `{ field: { $operator: value } }`
- **MySQL:** `{ where: { field: { [Op.operator]: value } } }`

### Associations
- **MongoDB:** `.populate('field')`
- **MySQL:** `include: [{ model: Model, as: 'alias' }]`

## Environment Variables

### Before (MongoDB)
```env
MONGO_URI=mongodb://localhost:27017/digital-meeting-assistant
```

### After (MySQL)
```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your-password
DB_NAME=meet_gov
```

## Database Schema

The SQL schema is already defined in `database/schema.sql`. The Sequelize models match this schema.

## Migration Steps

1. **Install MySQL** (if not already installed)
2. **Create database:**
   ```sql
   CREATE DATABASE meet_gov;
   ```
3. **Run schema:**
   ```bash
   mysql -u root -p meet_gov < database/schema.sql
   ```
4. **Update .env** with MySQL credentials
5. **Install dependencies:**
   ```bash
   npm install
   ```
6. **Start server:**
   ```bash
   npm run dev
   ```

## Data Migration (if needed)

If you have existing MongoDB data:

1. Export data from MongoDB
2. Transform ObjectIds to integers
3. Import to MySQL

**Note:** This is a fresh project, so no data migration is needed.

## Testing

After migration:
1. Test user registration
2. Test meeting creation
3. Test attendance logging
4. Test all API endpoints
5. Verify database relationships

## Troubleshooting

### Connection Issues
- Verify MySQL is running: `mysql -u root -p`
- Check credentials in `.env`
- Verify database exists

### Foreign Key Errors
- Ensure tables are created in correct order
- Check foreign key constraints in schema

### Query Errors
- Verify all `_id` references changed to `id`
- Check Sequelize query syntax
- Verify associations are defined

## Files Changed

- `package.json` - Dependencies
- `src/config.js` - Database configuration
- `src/database/connection.js` - New Sequelize connection
- `src/models/*.js` - All models converted
- `src/server.js` - Database connection
- `src/api/*.js` - All API routes updated
- `ENV_SETUP.md` - Environment variables updated

## Benefits of MySQL

- ACID compliance
- Strong consistency
- Better for relational data
- Mature ecosystem
- Better tooling
- SQL queries for complex operations

