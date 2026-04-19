const config = require('./env');

const buildBaseConfig = () => {
  if (process.env.DATABASE_URL) {
    return {
      use_env_variable: 'DATABASE_URL',
      dialect: 'postgres',
      logging: config.nodeEnv === 'development' ? console.log : false,
      dialectOptions: {},
    };
  }

  if (config.database.dialect === 'sqlite') {
    return {
      dialect: 'sqlite',
      storage: config.database.storage,
      logging: config.nodeEnv === 'development' ? console.log : false,
    };
  }

  return {
    dialect: config.database.dialect,
    host: config.database.host,
    port: config.database.port,
    database: config.database.name,
    username: config.database.user,
    password: config.database.password,
    logging: config.nodeEnv === 'development' ? console.log : false,
  };
};

const baseConfig = buildBaseConfig();

module.exports = {
  development: baseConfig,
  test: {
    ...baseConfig,
    logging: false,
  },
  production: {
    ...baseConfig,
    logging: false,
  },
};
