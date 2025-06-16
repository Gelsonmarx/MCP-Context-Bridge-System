/**
 * SmartCache<T> - Advanced caching solution with TTL and LRU eviction
 * 
 * Features:
 * - Time To Live (TTL) support with default and custom expiration
 * - Maximum size limit with Least Recently Used (LRU) eviction
 * - Pattern-based cache invalidation using RegExp
 * - Automatic pruning of expired entries
 */

interface CacheEntry<T> {
  value: T;
  expiry: number;  // Timestamp when this entry expires
  lastAccessed: number;  // Timestamp for LRU tracking
}

export class SmartCache<T> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private maxSize: number;
  private ttl: number;  // Default TTL in milliseconds

  /**
   * Creates a new SmartCache instance
   * 
   * @param maxSize Maximum number of entries to store (default: 1000)
   * @param ttl Default time-to-live in milliseconds (default: 5 minutes)
   */
  constructor(maxSize: number = 1000, ttl: number = 5 * 60 * 1000) {
    this.maxSize = maxSize;
    this.ttl = ttl;
  }

  /**
   * Store a value in the cache
   * 
   * @param key The cache key
   * @param value The value to store
   * @param customTTL Optional custom TTL for this specific entry
   */
  set(key: string, value: T, customTTL?: number): void {
    this.prune();  // Clean expired entries first
    
    const now = Date.now();
    const ttl = customTTL !== undefined ? customTTL : this.ttl;
    
    const entry: CacheEntry<T> = {
      value,
      expiry: now + ttl,
      lastAccessed: now
    };

    // If we're at capacity and adding a new key, make room first
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictLRU();
    }

    this.cache.set(key, entry);
  }

  /**
   * Retrieve a value from the cache
   * 
   * @param key The cache key
   * @returns The cached value or null if not found or expired
   */
  get(key: string): T | null {
    const entry = this.cache.get(key);
    const now = Date.now();

    if (!entry) {
      return null;
    }

    // Check if entry has expired
    if (entry.expiry <= now) {
      this.cache.delete(key);
      return null;
    }

    // Update last accessed time for LRU tracking
    entry.lastAccessed = now;
    return entry.value;
  }

  /**
   * Invalidate all cache entries matching the given pattern
   * 
   * @param pattern Regular expression pattern to match against keys
   * @returns Number of entries that were invalidated
   */
  invalidatePattern(pattern: RegExp): number {
    let count = 0;
    
    for (const key of this.cache.keys()) {
      if (pattern.test(key)) {
        this.cache.delete(key);
        count++;
      }
    }
    
    return count;
  }

  /**
   * Remove all entries from the cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get the current number of entries in the cache
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Check if a key exists in the cache and is not expired
   * 
   * @param key The cache key
   * @returns True if the key exists and is valid, false otherwise
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return false;
    }
    
    if (entry.expiry <= Date.now()) {
      this.cache.delete(key);
      return false;
    }
    
    return true;
  }

  /**
   * Remove expired entries from the cache
   * 
   * @returns Number of entries that were pruned
   */
  private prune(): number {
    const now = Date.now();
    let count = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiry <= now) {
        this.cache.delete(key);
        count++;
      }
    }
    
    return count;
  }

  /**
   * Evict the least recently used entry from the cache
   */
  private evictLRU(): void {
    let oldest: { key: string; time: number } | null = null;
    
    for (const [key, entry] of this.cache.entries()) {
      if (!oldest || entry.lastAccessed < oldest.time) {
        oldest = { key, time: entry.lastAccessed };
      }
    }
    
    if (oldest) {
      this.cache.delete(oldest.key);
    }
  }
}
