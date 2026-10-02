const {setTimeout:delay}=require('node:timers/promises');
const mongoose=require('mongoose');
const Click=require('../models/click');
const {isValidCode}=require('../utils/urlValidation');
const {CLICK_STREAM,CLICK_GROUP}=require('./clickStream');

const RETRY_IDLE_MS=30000;
const BATCH_SIZE=50;

async function ensureConsumerGroup(redisClient) {
    try{
        await redisClient.xGroupCreate(CLICK_STREAM,CLICK_GROUP,"0",{MKSTREAM:true});
    }
    catch(error){
        if(!error.message.startsWith("BUSYGROUP")){
            throw error;
        }
    }
}

function parseClickEvent(event) {
    const timestamp=new Date(event.timestamp);
    if(typeof event.eventId !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(event.eventId) ||
        !mongoose.isObjectIdOrHexString(event.urlId) || !isValidCode(event.code) ||
        typeof event.timestamp !== "string" || Number.isNaN(timestamp.getTime()) ||
        typeof event.userAgent !== "string" || typeof event.referrer !== "string"){
        throw new Error("Invalid click event");
    }

    return {
        _id:event.eventId,urlId:event.urlId,code:event.code,timestamp,
        userAgent:event.userAgent,referrer:event.referrer
    };
}

async function persistClick(message) {
    const click=parseClickEvent(message.message);
    // The event ID is MongoDB's unique _id; replaying an event leaves it unchanged.
    const result=await Click.updateOne({_id:click._id},{$setOnInsert:click},{
        upsert:true,runValidators:true,writeConcern:{w:1}
    });
    if(!result.acknowledged || !(result.matchedCount || result.upsertedCount)){
        throw new Error("Click persistence was not acknowledged by MongoDB");
    }
}

async function processMessages(redisClient,messages,signal) {
    for(const message of messages){
        if(signal?.aborted){
            break;
        }
        if(!message){
            continue;
        }
        try{
            await persistClick(message);
            await redisClient.xAck(CLICK_STREAM,CLICK_GROUP,message.id);
        }
        catch(error){
            console.error(`Click ${message.id} remains pending:`,error.message);
        }
    }
}

async function runClickWorker(redisClient,{consumerName,signal}) {
    let claimCursor="0-0";
    let groupReady=false;
    while(!signal.aborted){
        try{
            if(!groupReady){
                await ensureConsumerGroup(redisClient);
                groupReady=true;
            }
            const claimed=await redisClient.xAutoClaim(
                CLICK_STREAM,CLICK_GROUP,consumerName,RETRY_IDLE_MS,claimCursor,{COUNT:BATCH_SIZE}
            );
            claimCursor=claimed.nextId;
            await processMessages(redisClient,claimed.messages,signal);
            if(signal.aborted){
                break;
            }
            const streams=await redisClient.xReadGroup(
                CLICK_GROUP,consumerName,{key:CLICK_STREAM,id:">"},{COUNT:BATCH_SIZE,BLOCK:1000}
            );
            await processMessages(redisClient,streams?.[0]?.messages || [],signal);
        }
        catch(error){
            groupReady=false;
            console.error("Click worker could not read the stream:",error.message);
            await delay(1000,undefined,{signal}).catch(()=>{});
        }
    }
}

module.exports={ensureConsumerGroup,processMessages,runClickWorker};
