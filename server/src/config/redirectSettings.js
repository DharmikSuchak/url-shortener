function positiveInteger(name,defaultValue,maximum) {
    const value=process.env[name];
    if(value===undefined){
        return defaultValue;
    }

    if(!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value)>maximum){
        throw new Error(`${name} must be an integer from 1 to ${maximum}`);
    }
    return Number(value);
}

function keyPrefix(name,defaultValue) {
    const value=process.env[name] ?? defaultValue;
    if(!value.trim() || /\s/.test(value)){
        throw new Error(`${name} must be a non-empty Redis key prefix without whitespace`);
    }
    return value;
}

function proxyTrust(value=process.env.TRUST_PROXY) {
    if(value===undefined || value==="false"){
        return false;
    }
    // Trust explicit addresses/subnets, never every hop or an arbitrary hop count.
    if(!value.trim() || value==="true" || /^\d+$/.test(value)){
        throw new Error("TRUST_PROXY must be false or a comma-separated list of trusted proxy addresses/subnets");
    }
    return value.split(",").map((address)=>address.trim());
}

module.exports={
    cachePrefix:keyPrefix("REDIRECT_CACHE_PREFIX","short-url:redirect"),
    cacheTtlSeconds:positiveInteger("REDIRECT_CACHE_TTL_SECONDS",300,3600),
    ratePrefix:keyPrefix("CREATE_RATE_PREFIX","short-url:rate:create"),
    rateLimit:positiveInteger("CREATE_RATE_LIMIT",20,10000),
    rateWindowSeconds:positiveInteger("CREATE_RATE_WINDOW_SECONDS",60,86400),
    proxyTrust:proxyTrust()
};
