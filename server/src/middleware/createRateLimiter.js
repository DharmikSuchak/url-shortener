const {createHash}=require('node:crypto');
const settings=require('../config/redirectSettings');

const RATE_SCRIPT=`
local count = redis.call('INCR', KEYS[1])
local ttl = redis.call('PTTL', KEYS[1])
if ttl < 0 then
    redis.call('PEXPIRE', KEYS[1], ARGV[1])
    ttl = tonumber(ARGV[1])
end
return {count, ttl}
`;

function rateKey(ip,prefix=settings.ratePrefix) {
    return `${prefix}:${createHash("sha256").update(ip).digest("hex")}`;
}

async function createRateLimiter(req,res,next) {
    const {rateLimit,rateWindowSeconds,ratePrefix}=req.app.locals.redirectSettings;
    try{
        const client=req.app.locals.redisClient;
        if(!client?.isReady){
            throw new Error("Redis is unavailable for rate limiting");
        }
        const [count,ttl]=await client.withCommandOptions({timeout:2000}).eval(RATE_SCRIPT,{
            keys:[rateKey(req.ip,ratePrefix)],arguments:[String(rateWindowSeconds*1000)]
        });
        if(count>rateLimit){
            res.set("Retry-After",String(Math.max(1,Math.ceil(ttl/1000))));
            return res.status(429).json({error: "Too many URL creation requests; please try again later"});
        }
        return next();
    }
    catch(error){
        console.error("Could not enforce URL creation rate limit:",error.message);
        return res.status(503).json({error: "URL creation rate limiting is unavailable; please try again"});
    }
}

module.exports={createRateLimiter,rateKey};
