function isValidCode(code) {
    return typeof code === "string" && /^[A-Za-z0-9_-]{3,64}$/.test(code);
}

function parseOriginalUrl(originalUrl,field) {
    if(typeof originalUrl !== "string" || !originalUrl.trim()){
        throw new Error(`${field} must be a non-empty string`);
    }

    let parsedUrl;
    try{
        parsedUrl=new URL(originalUrl);
    }
    catch{
        throw new Error(`${field} must be a valid URL`);
    }

    if(!["http:","https:"].includes(parsedUrl.protocol)){
        throw new Error("Only http and https urls are allowed");
    }

    return parsedUrl.href;
}

function parseDestination(body) {
    const url=body?.url===undefined ? undefined : parseOriginalUrl(body.url,"url");
    const originalUrl=body?.originalUrl===undefined ? undefined : parseOriginalUrl(body.originalUrl,"originalUrl");
    if(url && originalUrl && url!==originalUrl){
        throw new Error("url and originalUrl must identify the same destination");
    }
    if(!url && !originalUrl){
        throw new Error("url is required (originalUrl is also accepted)");
    }

    return url || originalUrl;
}

function parseExpiry(value) {
    if(value===undefined){
        return undefined;
    }
    if(typeof value !== "string" || !value.trim()){
        throw new Error("expiresAt must be a valid date string");
    }

    const expiresAt=new Date(value);
    if(Number.isNaN(expiresAt.getTime())){
        throw new Error("Invalid expiry date");
    }
    if(expiresAt.getTime()<=Date.now()){
        throw new Error("Expiry date must be in the future");
    }

    return expiresAt;
}

function parseAlias(alias) {
    if(alias===undefined){
        return undefined;
    }
    if(typeof alias === "string" && ["api","health"].includes(alias.toLowerCase())){
        throw new Error("alias is reserved");
    }
    if(typeof alias !== "string" || !/^[A-Za-z0-9_-]{6,7}$/.test(alias)){
        throw new Error("Custom alias must be 6–7 characters (maximum 7). Use only letters, numbers, hyphens, or underscores.");
    }

    return alias;
}

function parseUrlInput(body) {
    return {
        originalUrl:parseDestination(body),
        expiresAt:parseExpiry(body?.expiresAt),
        alias:parseAlias(body?.alias)
    };
}

module.exports={parseUrlInput,isValidCode};
