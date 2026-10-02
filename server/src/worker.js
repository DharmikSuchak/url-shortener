require('dotenv').config();

const {randomUUID}=require('node:crypto');
const {hostname}=require('node:os');
const mongoose=require('mongoose');
const connectMongoDB=require('./config/mongo');
const connectRedis=require('./config/redis');
const Click=require('./models/click');
const {runClickWorker}=require('./analytics/clickWorker');

const controller=new AbortController();
const consumerName=`${hostname()}:${process.pid}:${randomUUID()}`;
process.once("SIGINT",()=>controller.abort());
process.once("SIGTERM",()=>controller.abort());

async function startWorker() {
    let redisClient;
    try{
        await connectMongoDB();
        await Click.init();
        redisClient=await connectRedis();
        console.log("Click worker started:",consumerName);
        await runClickWorker(redisClient,{consumerName,signal:controller.signal});
    }
    catch(error){
        console.error("Click worker failed:",error.message);
        process.exitCode=1;
    }
    finally{
        if(redisClient?.isOpen){
            await redisClient.close();
        }
        await mongoose.disconnect();
    }
}

startWorker().catch((error)=>{
    console.error("Click worker shutdown failed:",error.message);
    process.exitCode=1;
});
