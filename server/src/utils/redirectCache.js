const Url=require('../models/url');
const {randomUUID}=require('node:crypto');
const {isObjectIdOrHexString}=require('mongoose');
const {isValidCode}=require('./urlValidation');
const settings=require('../config/redirectSettings');
const FILL_TTL_MS=5000;
const RELEASE_SCRIPT=`
if redis.call('GET', KEYS[1]) == ARGV[1] then
    return redis.call('DEL', KEYS[1])
end
return 0
`;
const FILL_SCRIPT=`
if redis.call('GET', KEYS[1]) == ARGV[1] then
    redis.call('SET', KEYS[1], ARGV[2], 'PXAT', ARGV[3])
    return 1
end
return 0
`;

function cacheKey(code,prefix=settings.cachePrefix) {
    return `${prefix}:${code}`;
}

function parseCacheEntry(value) {
    const entry=JSON.parse(value);
    if(!isObjectIdOrHexString(entry?._id) || typeof entry?.originalUrl !== "string" ||
        !(entry.expiresAt===null || (typeof entry.expiresAt === "string" && Number.isFinite(Date.parse(entry.expiresAt))))){
        throw new Error("Invalid redirect cache entry");
    }
    const destination=new URL(entry.originalUrl);
    if(!["http:","https:"].includes(destination.protocol)){
        throw new Error("Invalid cached destination protocol");
    }
    return {_id:entry._id,originalUrl:entry.originalUrl,expiresAt:entry.expiresAt===null ? undefined : new Date(entry.expiresAt)};
}

async function releaseEntry(client,key,token) {
    return client.withCommandOptions({timeout:1000}).eval(RELEASE_SCRIPT,{keys:[key],arguments:[token]});
}

async function reserveFill(client,key) {
    const fillToken=`loading:${randomUUID()}`;
    const reserved=await client.withCommandOptions({timeout:1000}).set(key,fillToken,{
        condition:"NX",expiration:{type:"PX",value:FILL_TTL_MS}
    });
    return {fillToken:reserved ? fillToken : undefined};
}

async function readCache(client,key) {
    try{
        if(!client?.isReady){
            return {};
        }
        const value=await client.withCommandOptions({timeout:1000}).get(key);
        if(value!==null){
            if(value.startsWith("loading:") || value.startsWith("invalidating:")){
                return {};
            }
            try{
                const cached=parseCacheEntry(value);
                if(cached.expiresAt?.getTime()<=Date.now()){
                    await releaseEntry(client,key,value).catch((error)=>{
                        console.error("Could not remove expired redirect cache:",error.message);
                    });
                }
                return {cached};
            }
            catch(error){
                console.error("Invalid redirect cache entry:",error.message);
                await releaseEntry(client,key,value);
            }
        }

        return await reserveFill(client,key);
    }
    catch(error){
        console.error("Could not read redirect cache:",error.message);
        return {};
    }
}

async function writeCache(client,key,fillToken,savedUrl,ttlSeconds) {
    try{
        if(!client?.isReady || !fillToken){
            return;
        }
        const expiresAt=savedUrl?.expiresAt?.getTime();
        const deadline=Math.min(Date.now()+ttlSeconds*1000,expiresAt ?? Infinity);
        if(!savedUrl || deadline<=Date.now()){
            await releaseEntry(client,key,fillToken);
            return;
        }
        const entry={_id:savedUrl._id.toString(),originalUrl:savedUrl.originalUrl,expiresAt:savedUrl.expiresAt?.toISOString() ?? null};
        // Only the original miss may fill this slot; deletion replaces its token.
        await client.withCommandOptions({timeout:1000}).eval(FILL_SCRIPT,{
            keys:[key],arguments:[fillToken,JSON.stringify(entry),String(deadline)]
        });
    }
    catch(error){
        console.error("Could not write redirect cache:",error.message);
    }
}

function invalidationError(message,cause) {
    const error=new Error(message,{cause});
    error.code="CACHE_INVALIDATION_FAILED";
    return error;
}

async function deleteCachedUrl(client,code,{cachePrefix}) {
    // Observe identity before blocking; another delete must not remove a reused alias.
    const savedUrl=await Url.findOne({code}).select("_id").lean();
    const key=cacheKey(code,cachePrefix);
    const token=`invalidating:${randomUUID()}`;
    try{
        if(!client?.isReady){
            throw new Error("Redis is unavailable for cache invalidation");
        }
        // No expiry: a crash must leave caching blocked until deletion is retried.
        await client.withCommandOptions({timeout:1000}).set(key,token);
    }
    catch(error){
        throw invalidationError("Could not invalidate redirect cache; URL deletion has not started",error);
    }

    const deletedUrl=savedUrl ? await Url.findOneAndDelete({_id:savedUrl._id}) : null;
    try{
        await releaseEntry(client,key,token);
    }
    catch(error){
        throw invalidationError("URL deletion completed but cache cleanup failed; retry deletion",error);
    }
    return deletedUrl;
}

async function resolveUrl(client,code,{cachePrefix,cacheTtlSeconds}) {
    if(!isValidCode(code)){
        return Url.findOne({code}).lean();
    }
    const key=cacheKey(code,cachePrefix);
    const {cached,fillToken}=await readCache(client,key);
    if(cached){
        return {...cached,code};
    }

    const savedUrl=await Url.findOne({code}).lean();
    await writeCache(client,key,fillToken,savedUrl,cacheTtlSeconds);
    return savedUrl;
}

module.exports={cacheKey,resolveUrl,deleteCachedUrl};
