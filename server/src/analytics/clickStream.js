const {randomUUID}=require('node:crypto');

const CLICK_STREAM=process.env.CLICK_STREAM || "short-url:clicks";
const CLICK_GROUP=process.env.CLICK_GROUP || "click-persistence";

async function queueClick(redisClient,{urlId,code,userAgent,referrer}) {
    if(!redisClient?.isReady){
        throw new Error("Redis is unavailable for click analytics");
    }

    return redisClient.withCommandOptions({timeout:2000}).xAdd(CLICK_STREAM,"*",{
        eventId:randomUUID(),
        urlId:urlId.toString(),
        code,
        timestamp:new Date().toISOString(),
        userAgent,
        referrer
    });
}

module.exports={CLICK_STREAM,CLICK_GROUP,queueClick};
