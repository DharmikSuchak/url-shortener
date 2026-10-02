function isValidCode(code) {
    return typeof code === "string" && /^[A-Za-z0-9_-]{3,64}$/.test(code);
}

function parseOriginalUrl(originalUrl) {
    if(typeof originalUrl !== "string" || !originalUrl.trim()){
        throw new Error("originalUrl is required");
    }

    let parsedUrl;
    try{
        parsedUrl=new URL(originalUrl);
    }
    catch{
        throw new Error("Invalid Url");
    }

    if(!["http:","https:"].includes(parsedUrl.protocol)){
        throw new Error("Only http and https urls are allowed");
    }

    return parsedUrl.href;
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
    if(!isValidCode(alias)){
        throw new Error("alias must contain 3 to 64 letters, digits, hyphens, or underscores");
    }
    if(["api","health"].includes(alias.toLowerCase())){
        throw new Error("alias is reserved");
    }

    return alias;
}

function parseUrlInput(body) {
    return {
        originalUrl:parseOriginalUrl(body?.originalUrl),
        expiresAt:parseExpiry(body?.expiresAt),
        alias:parseAlias(body?.alias)
    };
}

module.exports={parseUrlInput,isValidCode};
