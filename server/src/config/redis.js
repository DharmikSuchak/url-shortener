const {createClient} =require('redis');

async function connectRedis() {
    if(!process.env.REDIS_URL) {
        throw new Error("Redis url is not defined in env");
    }
    const client=createClient({url:process.env.REDIS_URL});

    client.on("error",(error)=>{
        console.error("Redis error: ",error);
    })

    await client.connect();
    console.log("Redis connected");

    return client;
}

module.exports=connectRedis;
