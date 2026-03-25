const { getRedis } = require('../config/redis');

const DEFAULT_TTL = 300; // 5 minutes

/**
 * Get cached data
 */
const getCache = async (key) => {
  try {
    const redis = getRedis();
    if (!redis) return null;
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    return null;
  }
};

/**
 * Set cache with TTL
 */
const setCache = async (key, data, ttl = DEFAULT_TTL) => {
  try {
    const redis = getRedis();
    if (!redis) return;
    await redis.setex(key, ttl, JSON.stringify(data));
  } catch (error) {
    // Silently fail
  }
};

/**
 * Delete cache by key
 */
const deleteCache = async (key) => {
  try {
    const redis = getRedis();
    if (!redis) return;
    await redis.del(key);
  } catch (error) {
    // Silently fail
  }
};

/**
 * Delete cache by pattern
 */
const deleteCacheByPattern = async (pattern) => {
  try {
    const redis = getRedis();
    if (!redis) return;
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch (error) {
    // Silently fail
  }
};

module.exports = { getCache, setCache, deleteCache, deleteCacheByPattern };
