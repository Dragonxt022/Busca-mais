const Redis = require('ioredis');
const config = require('./env');

const redisConfig = {
  host: process.env.REDIS_HOST || config.redis.host,
  port: parseInt(process.env.REDIS_PORT) || config.redis.port,
  maxRetriesPerRequest: null,
};

const redis = new Redis(redisConfig);

redis.on('connect', () => {
  console.log('Redis conectado');
});

redis.on('error', (err) => {
  console.error('Erro Redis:', err.message);
});

module.exports = { redis, redisConfig };