const express=require('express');
const {createUrl,isCodeConflict}=require('./utils/createUrl');
const {parseUrlInput,isValidCode}=require('./utils/urlValidation');
const {queueClick}=require('./analytics/clickStream');
const getClickStats=require('./analytics/clickStats');
const Url=require('./models/url');
const redirectSettings=require('./config/redirectSettings');
const {createRateLimiter}=require('./middleware/createRateLimiter');
const {resolveUrl,deleteCachedUrl}=require('./utils/redirectCache');
const app=express();
app.locals.redirectSettings=redirectSettings;
app.set("trust proxy",redirectSettings.proxyTrust);
// Count malformed creation requests too, before JSON parsing can reject them.
app.post('/api/urls',createRateLimiter);
app.use(express.json());

function parsePaginationNumber(value,defaultValue,maximum) {
    if(value===undefined){
        return defaultValue;
    }

    if(typeof value !== "string" || !/^[1-9]\d*$/.test(value)){
        return null;
    }

    const number=Number(value);
    return Number.isSafeInteger(number) && number<=maximum ? number : null;
}

function urlResponse(savedUrl,baseUrl) {
    return {
        code:savedUrl.code,
        shortUrl:`${baseUrl}/${savedUrl.code}`,
        url:savedUrl.originalUrl,
        originalUrl:savedUrl.originalUrl,
        expiresAt:savedUrl.expiresAt
    };
}

app.get('/health',(req,res)=>{
    if(Url.db.readyState!==1 || !req.app.locals.redisClient?.isReady){
        return res.status(503).json({status: "unavailable"});
    }

    return res.json({status: "ok"});
});

app.post('/api/urls',async (req,res)=>{
    let urlInput;
    try{
        urlInput=parseUrlInput(req.body);
    }
    catch(error){
        return res.status(400).json({error: error.message});
    }

    try{
        const redisClient=req.app.locals.redisClient;
        const savedUrl=await createUrl(redisClient,urlInput);

        return res.status(201).json(urlResponse(savedUrl,req.app.locals.baseUrl));

    }
    catch(error){
        if(urlInput.alias!==undefined && isCodeConflict(error)){
            return res.status(409).json({error: "alias is already taken"});
        }

        if(error.code==="CODE_ALLOCATION_EXHAUSTED"){
            return res.status(503).json({error: "Could not allocate an available short URL; please try again"});
        }

        console.error(error);
        return res.status(500).json({ error: "Could not create short URL" });
    }

});

app.get('/api/urls',async (req,res)=>{
    const page=parsePaginationNumber(req.query.page,1,10000);
    const limit=parsePaginationNumber(req.query.limit,20,100);

    if(page===null || limit===null){
        return res.status(400).json({error: "page must be an integer from 1 to 10000 and limit from 1 to 100"});
    }

    try{
        const [savedUrls,totalItems]=await Promise.all([
            Url.find().sort({createdAt:-1,_id:-1}).skip((page-1)*limit).limit(limit).lean(),
            Url.countDocuments()
        ]);
        const totalPages=Math.ceil(totalItems/limit);
        const items=savedUrls.map((savedUrl)=>({
            ...urlResponse(savedUrl,req.app.locals.baseUrl),
            createdAt:savedUrl.createdAt
        }));

        return res.json({
            items,
            pagination:{page,limit,totalItems,totalPages,hasNextPage:page<totalPages,hasPreviousPage:page>1}
        });
    }
    catch(error){
        console.error(error);
        return res.status(500).json({error: "Could not list short URLs"});
    }
});

app.delete('/api/urls/:code',async (req,res)=>{
    if(!isValidCode(req.params.code)){
        return res.status(400).json({error: "code must contain 3 to 64 letters, digits, hyphens, or underscores"});
    }

    try{
        const deletedUrl=await deleteCachedUrl(req.app.locals.redisClient,req.params.code,req.app.locals.redirectSettings);

        if(!deletedUrl){
            return res.status(404).json({error: "Short URL not found"});
        }

        return res.status(204).end();
    }
    catch(error){
        console.error(error);
        if(error.code==="CACHE_INVALIDATION_FAILED"){
            return res.status(503).json({error:error.message});
        }
        return res.status(500).json({error: "Could not delete short URL"});
    }
});

app.get('/api/urls/:code/stats',async (req,res)=>{
    try{
        const savedUrl=await Url.findOne({code:req.params.code});
        if(!savedUrl){
            return res.status(404).json({error: "Short URL not found"});
        }

        const stats=await getClickStats(savedUrl._id);
        return res.json({
            code:savedUrl.code,
            url:savedUrl.originalUrl,
            originalUrl:savedUrl.originalUrl,
            createdAt:savedUrl.createdAt,
            ...stats
        });
    }
    catch(error){
        console.error(error);
        return res.status(500).json({error: "Could not load click statistics"});
    }
});

app.use('/api',(req,res)=>{
    return res.status(404).json({error: "API route not found"});
});

app.get('/:code',async (req,res)=>{
    try{
        const savedUrl=await resolveUrl(req.app.locals.redisClient,req.params.code,req.app.locals.redirectSettings);

        if(!savedUrl){
            return res.status(404).json({error: "Short URL not found"});
        }

        if(savedUrl.expiresAt && savedUrl.expiresAt.getTime()<=Date.now()){
            return res.status(410).json({error: "Short URL has expired"});
        }

        try{
            await queueClick(req.app.locals.redisClient,{
                urlId:savedUrl._id,
                code:savedUrl.code,
                userAgent:req.get("user-agent") || "",
                referrer:req.get("referer") || ""
            });
        }
        catch(error){
            console.error("Could not queue click analytics:",error.message);
            return res.status(503).json({error: "Click analytics is unavailable; please try again"});
        }

        return res.redirect(302,savedUrl.originalUrl);
    }
    catch(error){
        console.error(error);
        return res.status(500).json({error: "Could not resolve short URL"});
    }
});

app.use((error,req,res,next)=>{
    if(error.type==="entity.parse.failed"){
        return res.status(400).json({error: "Request body must be valid JSON"});
    }

    return next(error);
});

module.exports=app;
