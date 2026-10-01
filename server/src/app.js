const express=require('express');
const generateCode = require('./utils/generateCode');
const Url=require('./models/url');
const app=express();
app.use(express.json());

app.post('/api/urls',async (req,res)=>{
    const originalUrl=req.body?.originalUrl;

    if (typeof originalUrl !== "string" || !originalUrl.trim()) { //to check orgurl is string 
  return res.status(400).json({ error: "originalUrl is required" });
    }

    let parsedUrl;

    try{
        parsedUrl=new URL(originalUrl);
    }
    catch{
        return res.status(400).json({error: "Invalid Url"});
    }

    if(!["http:","https:"].includes(parsedUrl.protocol)){
        return res.status(400).json({error: "Only http and https urls are allowed"});
    }

    let expiresAt;
    if(req.body?.expiresAt!==undefined){

    expiresAt=new Date(req.body.expiresAt);

    if(Number.isNaN(expiresAt.getTime())){
        return res.status(400).json({
            error: "Invalid expiry date"
        });
    }

    if(expiresAt<=new Date()){
        return res.status(400).json({
            error: "Expiry date must be in the future"
        });
    }
}

    try{
    const redisClient=req.app.locals.redisClient;
    const code= await generateCode(redisClient);
    const savedUrl=await Url.create({
        code,
        originalUrl,
        expiresAt
    });

    return res.status(201).json({
        code:savedUrl.code,
        originalUrl:savedUrl.originalUrl,
        expiresAt: savedUrl.expiresAt
    })

    }
    catch(error){
        console.error(error);
        return res.status(500).json({ error: "Could not create short URL" });
    }    

});

module.exports=app;
