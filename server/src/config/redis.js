const {createClient}=require('redis');

async function connectRedis() {
    if(!process.env.REDIS_URL) {
        throw new Error("REDIS_URL is required");
    }
    const client=createClient({
        url:process.env.REDIS_URL,
        disableOfflineQueue:true,
        commandOptions:{timeout:5000}
    });

    client.on("error",(error)=>{
        console.error("Redis error: ",error);
    });

    await client.connect();
    console.log("Redis connected");

    return client;
}

module.exports=connectRedis;
