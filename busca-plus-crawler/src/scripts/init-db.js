require('dotenv').config();

const sequelize = require('../config/database');
const models = require('../models');

async function initDatabase() {
  try {
    await sequelize.authenticate();
    console.log('Database connection established');

    await sequelize.sync({ alter: true });
    console.log('Tables synchronized');

    const sourceCount = await models.Source.count();
    const pageCount = await models.Page.count();
    
    console.log(`Sources: ${sourceCount}, Pages: ${pageCount}`);
    
    process.exit(0);
  } catch (error) {
    console.error('Failed to initialize database:', error);
    process.exit(1);
  }
}

initDatabase();