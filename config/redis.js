const Redis = require('ioredis');

let redis = null;

const connectRedis = () => {
  try {
    redis = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 3) {
          console.warn('⚠️ Redis connection failed, running without cache');
          return null;
        }
        return Math.min(times * 200, 2000);
      },
    });

    redis.on('connect', () => console.log('✅ Redis connected'));
    redis.on('error', (err) => console.warn('⚠️ Redis error:', err.message));
  } catch (error) {
    console.warn('⚠️ Redis unavailable, running without cache');
  }
  return redis;
};

const getRedis = () => redis;

module.exports = { connectRedis, getRedis };
