const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {setTimeout:delay}=require('node:timers/promises');
const mongoose=require('mongoose');
const {createClient}=require('redis');

const runId=randomUUID().replace(/-/g,"");
const databaseName=`url_shortener_test_${runId}`;
const redisNamespace=`short-url:test:${runId}`;
const counterKey=`${redisNamespace}:counter`;
const streamKey=`${redisNamespace}:clicks`;
const cachePrefix=`${redisNamespace}:redirect`;
const ratePrefix=`${redisNamespace}:rate:create`;
process.env.URL_COUNTER_KEY=counterKey;
process.env.CLICK_STREAM=streamKey;
process.env.CLICK_GROUP=`${redisNamespace}:persistence`;
process.env.REDIRECT_CACHE_PREFIX=cachePrefix;
process.env.CREATE_RATE_PREFIX=ratePrefix;
process.env.CREATE_RATE_LIMIT="1000";
process.env.CREATE_RATE_WINDOW_SECONDS="60";
process.env.REDIRECT_CACHE_TTL_SECONDS="300";
process.env.TRUST_PROXY="false";

// Set test keys before loading modules that read configuration at require time.
const app=require('../../src/app');
const Url=require('../../src/models/url');
const Click=require('../../src/models/click');
const {runClickWorker}=require('../../src/analytics/clickWorker');
const defaultSettings={...app.locals.redirectSettings};

let redisClient;
let workerClient;
let workerController;
let workerPromise;
let server;
let baseUrl;

function newRedisClient() {
    const client=createClient({
        url:process.env.TEST_REDIS_URL || "redis://127.0.0.1:6379",
        disableOfflineQueue:true,
        commandOptions:{timeout:3000},
        socket:{connectTimeout:3000,reconnectStrategy:false}
    });
    client.on("error",()=>{});
    return client;
}

function assertTestDatabase() {
    assert.match(databaseName,/^url_shortener_test_[0-9a-f]{32}$/);
    assert.equal(mongoose.connection.name,databaseName,"Refusing to clean a non-test database");
}

function assertTestKeys() {
    assert.match(redisNamespace,/^short-url:test:[0-9a-f]{32}$/);
    assert.equal(process.env.URL_COUNTER_KEY,counterKey);
    assert.equal(process.env.CLICK_STREAM,streamKey);
    assert.equal(process.env.REDIRECT_CACHE_PREFIX,cachePrefix);
    assert.equal(process.env.CREATE_RATE_PREFIX,ratePrefix);
}

async function deleteTestKeys() {
    assertTestKeys();
    for await(const keys of redisClient.scanIterator({MATCH:`${redisNamespace}:*`,COUNT:100})){
        if(keys.length){
            assert.ok(keys.every((key)=>key.startsWith(`${redisNamespace}:`)));
            await redisClient.del(keys);
        }
    }
}

async function setup() {
    await mongoose.connect(process.env.TEST_MONGODB_URI || "mongodb://127.0.0.1:27017",{
        dbName:databaseName,serverSelectionTimeoutMS:3000
    });
    assertTestDatabase();
    await Promise.all([Url.init(),Click.init()]);
    redisClient=newRedisClient();
    await redisClient.connect();
    app.locals.redisClient=redisClient;
    await new Promise((resolve,reject)=>{
        server=app.listen(0,"127.0.0.1",resolve);
        server.once("error",reject);
    });
    baseUrl=`http://127.0.0.1:${server.address().port}`;
    app.locals.baseUrl=baseUrl;
}

async function resetData() {
    assertTestDatabase();
    app.locals.redirectSettings={...defaultSettings};
    app.set("trust proxy",false);
    await Promise.all([Url.deleteMany({}),Click.deleteMany({})]);
    await deleteTestKeys();
}

async function startWorker() {
    assert.equal(workerPromise,undefined,"A test worker is already running");
    workerClient=newRedisClient();
    await workerClient.connect();
    workerController=new AbortController();
    workerPromise=runClickWorker(workerClient,{
        consumerName:`test-${runId}`,signal:workerController.signal
    });
}

async function stopWorker() {
    workerController?.abort();
    if(workerPromise){
        await workerPromise;
    }
    if(workerClient?.isOpen){
        await workerClient.close();
    }
    workerPromise=undefined;
    workerClient=undefined;
    workerController=undefined;
}

async function cleanup() {
    await stopWorker();
    if(server){
        await new Promise((resolve,reject)=>{
            server.close((error)=>error ? reject(error) : resolve());
        });
    }
    if(redisClient?.isReady){
        await deleteTestKeys();
    }
    if(redisClient?.isOpen){
        await redisClient.close();
    }
    try{
        if(mongoose.connection.readyState===1){
            assertTestDatabase();
            await mongoose.connection.dropDatabase();
        }
    }
    finally{
        await mongoose.disconnect();
    }
}

function request(path,options={}) {
    return fetch(`${baseUrl}${path}`,{signal:AbortSignal.timeout(5000),...options});
}

function createUrl(body) {
    return request('/api/urls',{
        method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)
    });
}

async function createLink(body={originalUrl:"https://example.com/path"}) {
    const response=await createUrl(body);
    assert.equal(response.status,201);
    return response.json();
}

async function getStats(code) {
    const response=await request(`/api/urls/${code}/stats`);
    assert.equal(response.status,200);
    return response.json();
}

async function eventually(check) {
    const deadline=Date.now()+5000;
    let lastError;
    while(Date.now()<deadline){
        try{
            return await check();
        }
        catch(error){
            lastError=error;
            await delay(50);
        }
    }
    throw lastError;
}

module.exports={
    app,Url,Click,counterKey,streamKey,cachePrefix,ratePrefix,setup,resetData,cleanup,startWorker,stopWorker,
    request,createUrl,createLink,getStats,eventually,newRedisClient,
    getRedisClient:()=>redisClient,getBaseUrl:()=>baseUrl
};
