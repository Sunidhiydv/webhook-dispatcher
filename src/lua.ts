export const ENQUEUE = `
local ready = KEYS[1]
local processing = KEYS[2]
local added = 0
for i = 1, #ARGV, 2 do
  local score = tonumber(ARGV[i])
  local id = ARGV[i + 1]
  if id ~= nil and score ~= nil then
    local inflight = redis.call('ZSCORE', processing, id)
    if inflight == false or inflight == nil then
      redis.call('ZADD', ready, score, id)
      added = added + 1
    end
  end
end
return added
`;

export const CLAIM = `
local ready = KEYS[1]
local processing = KEYS[2]
local now = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local visibility = tonumber(ARGV[3])
if limit <= 0 then
  return {}
end
local items = redis.call('ZRANGE', ready, '-inf', now, 'BYSCORE', 'LIMIT', 0, limit)
local deadline = now + visibility
for i = 1, #items do
  redis.call('ZREM', ready, items[i])
  redis.call('ZADD', processing, deadline, items[i])
end
return items
`;

export const REAP = `
local ready = KEYS[1]
local processing = KEYS[2]
local now = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local items = redis.call('ZRANGE', processing, '-inf', now, 'BYSCORE', 'LIMIT', 0, limit)
for i = 1, #items do
  redis.call('ZREM', processing, items[i])
  redis.call('ZADD', ready, now, items[i])
end
return #items
`;

export const ACK = `
redis.call('ZREM', KEYS[1], ARGV[1])
redis.call('ZREM', KEYS[2], ARGV[1])
return 1
`;

export const RESCHEDULE = `
redis.call('ZREM', KEYS[1], ARGV[1])
redis.call('ZREM', KEYS[2], ARGV[1])
redis.call('ZADD', KEYS[1], tonumber(ARGV[2]), ARGV[1])
return 1
`;

export const TOKEN_BUCKET = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local rate = tonumber(ARGV[2])
local burst = tonumber(ARGV[3])
local tokens = tonumber(redis.call('HGET', key, 'tokens'))
local ts = tonumber(redis.call('HGET', key, 'ts'))
if tokens == nil then
  tokens = burst
  ts = now
end
local elapsed = math.max(0, now - ts) / 1000
tokens = math.min(burst, tokens + elapsed * rate)
local allowed = 0
local retryMs = 0
if tokens >= 1 then
  tokens = tokens - 1
  allowed = 1
else
  retryMs = math.ceil(((1 - tokens) / rate) * 1000)
end
redis.call('HSET', key, 'tokens', tokens, 'ts', now)
redis.call('PEXPIRE', key, 60000)
return { allowed, retryMs }
`;
