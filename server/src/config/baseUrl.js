function getBaseUrl(value=process.env.BASE_URL) {
    let parsedUrl;

    try{
        parsedUrl=new URL(value);
    }
    catch{
        throw new Error("BASE_URL must be a valid absolute HTTP or HTTPS URL");
    }

    if(!["http:","https:"].includes(parsedUrl.protocol) ||
        parsedUrl.username || parsedUrl.password || parsedUrl.search || parsedUrl.hash){
        throw new Error("BASE_URL must use HTTP or HTTPS without credentials, a query, or a fragment");
    }

    return parsedUrl.href.replace(/\/+$/,"");
}

module.exports=getBaseUrl;
