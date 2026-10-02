const assert=require('node:assert/strict');
const {describe,before,beforeEach,afterEach,after,test}=require('node:test');
const integration=require('./helpers/integration');
const {
    app,Url,Click,counterKey,streamKey,cachePrefix,ratePrefix,setup,resetData,cleanup,startWorker,stopWorker,
    request,createUrl,createLink,getStats,eventually,getRedisClient,getBaseUrl,newRedisClient
}=integration;
const encodeBase62=require('../src/utils/base62');
const {permuteCounter,CODE_DOMAIN}=require('../src/utils/permuteCounter');
const {CLICK_GROUP}=require('../src/analytics/clickStream');
const {ensureConsumerGroup,processMessages}=require('../src/analytics/clickWorker');
const {cacheKey}=require('../src/utils/redirectCache');
const {rateKey}=require('../src/middleware/createRateLimiter');

function redirect(code,headers={}) {
    return request(`/${code}`,{redirect:"manual",headers});
}

function redisCommands(overrides) {
    const client=getRedisClient();
    return {
        isReady:true,
        withCommandOptions:(options)=>Object.assign(client.withCommandOptions(options),overrides)
    };
}

async function readClickMessages() {
    const client=getRedisClient();
    await ensureConsumerGroup(client);
    const streams=await client.xReadGroup(CLICK_GROUP,"retry-test",{key:streamKey,id:">"},{COUNT:50});
    return streams[0].messages;
}

describe('URL API integration',{concurrency:false},()=>{
    before(setup,{timeout:10000});
    beforeEach(resetData,{timeout:5000});
    afterEach(stopWorker,{timeout:10000});
    after(cleanup,{timeout:10000});

    test('creates and persists a seven-character code with a configured short URL',async ()=>{
        const expiresAt=new Date(Date.now()+60000).toISOString();
        const link=await createLink({originalUrl:"  https://example.com/a b?search=value  ",expiresAt});
        assert.match(link.code,/^[0-9a-zA-Z]{7}$/);
        assert.equal(link.code,encodeBase62(permuteCounter(1)));
        assert.equal(link.shortUrl,`${getBaseUrl()}/${link.code}`);
        assert.equal(link.originalUrl,"https://example.com/a%20b?search=value");
        assert.equal(link.url,link.originalUrl);
        assert.equal(link.expiresAt,expiresAt);
        const saved=await Url.findOne({code:link.code});
        assert.equal(saved.originalUrl,link.originalUrl);
        assert.equal(saved.expiresAt.toISOString(),expiresAt);
        assert.equal(await getRedisClient().get(counterKey),"1");
    });

    test('accepts assignment url input and returns it in creation, listing, and stats',async ()=>{
        const expiresAt=new Date(Date.now()+60000).toISOString();
        const link=await createLink({url:"  https://example.com/a b  ",expiresAt});
        assert.equal(link.url,"https://example.com/a%20b");
        assert.equal(link.originalUrl,link.url);
        assert.equal(link.expiresAt,expiresAt);
        assert.equal((await redirect(link.code)).headers.get("location"),link.url);
        const listing=await (await request('/api/urls')).json();
        assert.equal(listing.items[0].url,link.url);
        assert.equal(listing.items[0].originalUrl,link.url);
        const stats=await getStats(link.code);
        assert.equal(stats.url,link.url);
        assert.equal(stats.originalUrl,link.url);
    });

    test('accepts matching normalized url fields and rejects conflicting destinations',async ()=>{
        const link=await createLink({url:"https://example.com",originalUrl:" https://example.com/ "});
        assert.equal(link.url,"https://example.com/");
        assert.equal(link.originalUrl,link.url);
        const response=await createUrl({url:"https://example.com/first",originalUrl:"https://example.com/second"});
        assert.equal(response.status,400);
        assert.match((await response.json()).error,/same destination/);
        assert.equal(await Url.countDocuments(),1);
        assert.equal(await getRedisClient().get(counterKey),"1");
    });

    test('rejects invalid url input even when originalUrl is valid',async ()=>{
        for(const url of [null,123,[],{},""," ","invalid","ftp://example.com","javascript:alert(1)"]){
            for(const originalUrl of [undefined,"https://example.com"]){
                const response=await createUrl({url,originalUrl});
                assert.equal(response.status,400);
                assert.equal(typeof (await response.json()).error,"string");
            }
        }
        const invalidLegacy=await createUrl({url:"https://example.com",originalUrl:null});
        assert.equal(invalidLegacy.status,400);
        assert.equal(await Url.countDocuments(),0);
        assert.equal(await getRedisClient().exists(counterKey),0);
    });

    test('rejects missing, malformed, non-string, and non-HTTP URLs',async ()=>{
        for(const originalUrl of [undefined,null,123,[],{},""," ","invalid","ftp://example.com","javascript:alert(1)"]){
            const response=await createUrl({originalUrl});
            assert.equal(response.status,400);
            assert.equal(typeof (await response.json()).error,"string");
        }
        assert.equal(await Url.countDocuments(),0);
        assert.equal(await getRedisClient().exists(counterKey),0);
    });

    test('rejects invalid and past expiry values without storing a link',async ()=>{
        for(const expiresAt of [null,true,123,[],{},""," ","invalid","2020-01-01T00:00:00Z"]){
            const response=await createUrl({originalUrl:"https://example.com",expiresAt});
            assert.equal(response.status,400);
            assert.equal(typeof (await response.json()).error,"string");
        }
        assert.equal(await Url.countDocuments(),0);
        assert.equal(await getRedisClient().exists(counterKey),0);
    });

    test('returns a JSON error for malformed request JSON',async ()=>{
        const response=await request('/api/urls',{
            method:"POST",headers:{"Content-Type":"application/json"},body:'{"originalUrl":'
        });
        assert.equal(response.status,400);
        assert.deepEqual(await response.json(),{error:"Request body must be valid JSON"});
    });

    test('redirects with 302 and queues click details before a worker persists them',async ()=>{
        const link=await createLink();
        const response=await request(`/${link.code}`,{
            redirect:"manual",headers:{"User-Agent":"integration-test/1","Referer":"https://referrer.example/start"}
        });
        assert.equal(response.status,302);
        assert.equal(response.headers.get("location"),link.originalUrl);
        const messages=await getRedisClient().xRange(streamKey,"-","+");
        assert.equal(messages.length,1);
        const event=messages[0].message;
        assert.equal(event.code,link.code);
        assert.equal(event.urlId,(await Url.findOne({code:link.code}))._id.toString());
        assert.equal(event.userAgent,"integration-test/1");
        assert.equal(event.referrer,"https://referrer.example/start");
        assert.ok(Number.isFinite(new Date(event.timestamp).getTime()));
        assert.equal(await Click.countDocuments(),0);
    });

    test('returns 404 for unknown redirects and stats without queuing clicks',async ()=>{
        for(const path of ["/unknown-code","/api/urls/unknown-code/stats"]){
            const response=await request(path,{redirect:"manual"});
            assert.equal(response.status,404);
            assert.equal(response.headers.get("location"),null);
            assert.deepEqual(await response.json(),{error:"Short URL not found"});
        }
        assert.equal(await getRedisClient().exists(streamKey),0);
    });

    test('returns 410 for an expired link without queuing a click',async ()=>{
        const link=await createLink({originalUrl:"https://example.com/expired",expiresAt:new Date(Date.now()+60000).toISOString()});
        // Move the saved deadline into the past instead of relying on a timed wait.
        await Url.updateOne({code:link.code},{expiresAt:new Date(Date.now()-1000)});
        const response=await request(`/${link.code}`,{redirect:"manual"});
        assert.equal(response.status,410);
        assert.equal(response.headers.get("location"),null);
        assert.deepEqual(await response.json(),{error:"Short URL has expired"});
        assert.equal(await getRedisClient().exists(streamKey),0);
        assert.equal((await getStats(link.code)).totalClicks,0);
    });

    test('returns 503 without redirecting when Redis cannot queue analytics',async (context)=>{
        context.mock.method(console,"error",()=>{});
        const link=await createLink();
        const disconnected=newRedisClient();
        await disconnected.connect();
        await disconnected.close();
        const originalClient=app.locals.redisClient;
        app.locals.redisClient=disconnected;
        try{
            const health=await request('/health');
            assert.equal(health.status,503);
            assert.deepEqual(await health.json(),{status:"unavailable"});
            const response=await request(`/${link.code}`,{redirect:"manual"});
            assert.equal(response.status,503);
            assert.equal(response.headers.get("location"),null);
            assert.match((await response.json()).error,/analytics/i);
            assert.equal(await getRedisClient().exists(streamKey),0);
        }
        finally{
            app.locals.redisClient=originalClient;
        }
    });

    test('reports empty stats, then persists multiple clicks with header details',async ()=>{
        const link=await createLink();
        const empty=await getStats(link.code);
        assert.equal(empty.totalClicks,0);
        assert.equal(empty.lastClickedAt,null);
        assert.deepEqual(empty.clicksByDay,[]);
        assert.deepEqual(empty.recentClicks,[]);
        for(let index=1;index<=3;index++){
            const headers={"User-Agent":`integration-test/${index}`};
            if(index!==3){
                headers.Referer=`https://referrer.example/${index}`;
            }
            const response=await request(`/${link.code}`,{redirect:"manual",headers});
            assert.equal(response.status,302);
        }
        assert.equal((await getStats(link.code)).totalClicks,0);
        await startWorker();
        const stats=await eventually(async ()=>{
            const result=await getStats(link.code);
            assert.equal(result.totalClicks,3);
            return result;
        });
        assert.equal(stats.originalUrl,link.originalUrl);
        assert.equal(stats.recentClicks.length,3);
        assert.equal(stats.clicksByDay.reduce((total,day)=>total+day.count,0),3);
        for(let index=1;index<=3;index++){
            const click=stats.recentClicks.find((event)=>event.userAgent===`integration-test/${index}`);
            assert.ok(click);
            assert.equal(click.code,link.code);
            assert.equal(click.referrer,index===3 ? "" : `https://referrer.example/${index}`);
            assert.ok(Number.isFinite(new Date(click.timestamp).getTime()));
        }
        const latest=Math.max(...stats.recentClicks.map((click)=>new Date(click.timestamp).getTime()));
        assert.equal(stats.lastClickedAt,new Date(latest).toISOString());
        assert.equal((await Url.findOne({code:link.code})).totalClicks,undefined);
        await eventually(async ()=>assert.equal((await getRedisClient().xPending(streamKey,CLICK_GROUP)).pending,0));
    });

    test('limits recent click details while keeping the full count',async ()=>{
        const link=await createLink();
        const responses=await Promise.all(Array.from({length:22},()=>request(`/${link.code}`,{redirect:"manual"})));
        assert.ok(responses.every((response)=>response.status===302));
        await startWorker();
        const stats=await eventually(async ()=>{
            const result=await getStats(link.code);
            assert.equal(result.totalClicks,22);
            return result;
        });
        assert.equal(stats.recentClicks.length,20);
        assert.equal(stats.clicksByDay.reduce((total,day)=>total+day.count,0),22);
    });

    test('retries an event without duplicating storage after acknowledgement fails',async (context)=>{
        context.mock.method(console,"error",()=>{});
        const link=await createLink();
        const redirect=await request(`/${link.code}`,{redirect:"manual"});
        assert.equal(redirect.status,302);
        const messages=await readClickMessages();
        await processMessages({xAck:async ()=>{throw new Error("Simulated acknowledgement failure");}},messages);
        assert.equal(await Click.countDocuments(),1);
        assert.equal((await getRedisClient().xPending(streamKey,CLICK_GROUP)).pending,1);
        await processMessages(getRedisClient(),messages);
        assert.equal(await Click.countDocuments(),1);
        assert.equal((await getStats(link.code)).totalClicks,1);
        assert.equal((await getRedisClient().xPending(streamKey,CLICK_GROUP)).pending,0);
    });

    test('does not acknowledge an event when persistence fails',async (context)=>{
        context.mock.method(console,"error",()=>{});
        const link=await createLink();
        const redirect=await request(`/${link.code}`,{redirect:"manual"});
        assert.equal(redirect.status,302);
        const messages=await readClickMessages();
        const updateMock=context.mock.method(Click,"updateOne",async ()=>{throw new Error("Simulated persistence failure");});
        await processMessages(getRedisClient(),messages);
        assert.equal(await Click.countDocuments(),0);
        assert.equal((await getRedisClient().xPending(streamKey,CLICK_GROUP)).pending,1);
        updateMock.mock.restore();
        await processMessages(getRedisClient(),messages);
        assert.equal(await Click.countDocuments(),1);
        assert.equal((await getRedisClient().xPending(streamKey,CLICK_GROUP)).pending,0);
    });

    test('returns empty items and default pagination metadata',async ()=>{
        const response=await request('/api/urls');
        assert.equal(response.status,200);
        assert.deepEqual(await response.json(),{
            items:[],pagination:{page:1,limit:20,totalItems:0,totalPages:0,hasNextPage:false,hasPreviousPage:false}
        });
    });

    test('paginates newest first with a stable ordering for equal creation times',async ()=>{
        await Url.create([
            {code:"oldest-link",originalUrl:"https://example.com/old",createdAt:new Date("2026-01-01")},
            {code:"first-tied-link",originalUrl:"https://example.com/first",createdAt:new Date("2026-01-02")},
            {code:"last-tied-link",originalUrl:"https://example.com/last",createdAt:new Date("2026-01-02")}
        ]);
        const first=await request('/api/urls?page=1&limit=2');
        assert.equal(first.status,200);
        const firstPage=await first.json();
        assert.deepEqual(firstPage.items.map((item)=>item.code),["last-tied-link","first-tied-link"]);
        assert.equal(firstPage.items[0].shortUrl,`${getBaseUrl()}/last-tied-link`);
        assert.deepEqual(firstPage.pagination,{page:1,limit:2,totalItems:3,totalPages:2,hasNextPage:true,hasPreviousPage:false});
        const second=await request('/api/urls?page=2&limit=2');
        const secondPage=await second.json();
        assert.deepEqual(secondPage.items.map((item)=>item.code),["oldest-link"]);
        assert.deepEqual(secondPage.pagination,{page:2,limit:2,totalItems:3,totalPages:2,hasNextPage:false,hasPreviousPage:true});
        const beyond=await request('/api/urls?page=10000&limit=100');
        assert.equal(beyond.status,200);
        assert.deepEqual((await beyond.json()).items,[]);
    });

    test('rejects invalid, repeated, and excessive pagination parameters',async ()=>{
        for(const query of ["page=0","page=-1","page=1.5","page=abc","page=","page=10001","page=1&page=2","limit=0","limit=-1","limit=1e2","limit=101","limit=9007199254740993","limit=1&limit=2"]){
            const response=await request(`/api/urls?${query}`);
            assert.equal(response.status,400,query);
            assert.equal(typeof (await response.json()).error,"string");
        }
    });

    test('deletes a link with 204 and returns 404 on subsequent requests',async ()=>{
        const link=await createLink();
        const deleted=await request(`/api/urls/${link.code}`,{method:"DELETE"});
        assert.equal(deleted.status,204);
        assert.equal(await deleted.text(),"");
        assert.equal(await Url.findOne({code:link.code}),null);
        for(const path of [`/${link.code}`,`/api/urls/${link.code}/stats`]){
            const response=await request(path,{redirect:"manual"});
            assert.equal(response.status,404);
        }
        const repeated=await request(`/api/urls/${link.code}`,{method:"DELETE"});
        assert.equal(repeated.status,404);
        const listing=await request('/api/urls');
        assert.deepEqual((await listing.json()).items,[]);
    });

    test('validates aliases and creates a usable alias without consuming the counter',async ()=>{
        const link=await createLink({originalUrl:"https://example.com/alias",alias:"My-l_26"});
        assert.equal(link.code,"My-l_26");
        assert.equal(await getRedisClient().exists(counterKey),0);
        const redirect=await request(`/${link.code}`,{redirect:"manual"});
        assert.equal(redirect.status,302);
        assert.equal(redirect.headers.get("location"),link.originalUrl);
        for(const alias of [null,123,{},"","ab","abcde","abcdefgh","a".repeat(65),"has space","ab/cde","abc.de","health","HEALTH","HeAlTh","api","API"]){
            const response=await createUrl({originalUrl:"https://example.com",alias});
            assert.equal(response.status,400);
        }
        assert.equal(await Url.countDocuments(),1);
    });

    test('accepts a six-character case-sensitive alias with URL-safe punctuation',async ()=>{
        const link=await createLink({url:"https://example.com/six",alias:"A_b-12"});
        assert.equal(link.code,"A_b-12");
        assert.equal((await redirect(link.code)).status,302);
        assert.equal((await redirect(link.code.toLowerCase())).status,404);
        assert.equal(await getRedisClient().exists(counterKey),0);
    });

    test('keeps existing short and longer aliases usable for redirects, stats, listing, and deletion',async ()=>{
        const codes=["old","legacy-alias-2026","x".repeat(64)];
        await Url.create(codes.map((code)=>({code,originalUrl:`https://example.com/${code}`})));
        for(const code of codes){
            for(let click=0;click<2;click++){
                const response=await redirect(code);
                assert.equal(response.status,302);
                assert.equal(response.headers.get("location"),`https://example.com/${code}`);
            }
        }
        await startWorker();
        for(const code of codes){
            await eventually(async ()=>assert.equal((await getStats(code)).totalClicks,2));
        }
        const listing=await (await request('/api/urls')).json();
        assert.deepEqual(listing.items.map((item)=>item.code).sort(),[...codes].sort());
        for(const code of codes){
            assert.equal((await createUrl({url:"https://example.com/new",alias:code})).status,400);
            assert.equal((await request(`/api/urls/${code}`,{method:"DELETE"})).status,204);
            assert.equal(await getRedisClient().exists(cacheKey(code,cachePrefix)),0);
            assert.equal((await redirect(code)).status,404);
            assert.equal((await request(`/api/urls/${code}/stats`)).status,404);
        }
        assert.equal(await Url.countDocuments(),0);
        assert.equal(await Click.countDocuments(),6);
    });

    test('returns 409 when an alias is already taken and preserves its destination',async ()=>{
        const first=await createLink({originalUrl:"https://example.com/owner",alias:"taken_1"});
        const conflict=await createUrl({originalUrl:"https://example.com/other",alias:first.code});
        assert.equal(conflict.status,409);
        assert.deepEqual(await conflict.json(),{error:"alias is already taken"});
        assert.equal((await Url.findOne({code:first.code})).originalUrl,first.originalUrl);
        assert.equal(await Url.countDocuments(),1);
    });

    test('resolves concurrent alias claims using the unique index',async ()=>{
        const responses=await Promise.all([
            createUrl({originalUrl:"https://example.com/first",alias:"race_01"}),
            createUrl({originalUrl:"https://example.com/second",alias:"race_01"})
        ]);
        assert.deepEqual(responses.map((response)=>response.status).sort(),[201,409]);
        assert.equal(await Url.countDocuments({code:"race_01"}),1);
    });

    test('skips a generated code claimed by an alias without overwriting it',async ()=>{
        const owner=await createLink({originalUrl:"https://example.com/alias-owner",alias:encodeBase62(permuteCounter(1))});
        const generated=await createLink();
        assert.equal(generated.code,encodeBase62(permuteCounter(2)));
        assert.equal((await Url.findOne({code:owner.code})).originalUrl,owner.originalUrl);
        assert.equal(await getRedisClient().get(counterKey),"2");
    });

    test('reusing a deleted alias starts fresh stats for the replacement link',async ()=>{
        const first=await createLink({originalUrl:"https://example.com/first",alias:"reuse_1"});
        const redirect=await request(`/${first.code}`,{redirect:"manual"});
        assert.equal(redirect.status,302);
        await startWorker();
        await eventually(async ()=>assert.equal((await getStats(first.code)).totalClicks,1));
        const deleted=await request(`/api/urls/${first.code}`,{method:"DELETE"});
        assert.equal(deleted.status,204);
        const replacement=await createLink({originalUrl:"https://example.com/replacement",alias:first.code});
        assert.equal((await getStats(replacement.code)).totalClicks,0);
        assert.equal(await Click.countDocuments(),1);
    });

    test('allocates the final counter once and returns 503 instead of wrapping the domain',async (context)=>{
        context.mock.method(console,"error",()=>{});
        await getRedisClient().set(counterKey,String(CODE_DOMAIN-2n));
        const link=await createLink();
        assert.equal(link.code,encodeBase62(permuteCounter(CODE_DOMAIN-1n)));
        const exhausted=await createUrl({originalUrl:"https://example.com"});
        assert.equal(exhausted.status,503);
        assert.equal(await Url.countDocuments(),1);
        assert.equal(await getRedisClient().get(counterKey),String(CODE_DOMAIN));
    });

    test('keeps old sequential codes and bounds retries when all permuted results are taken',async ()=>{
        await Url.create({code:"0000001",originalUrl:"https://example.com/legacy"});
        for(let counter=1;counter<=10;counter++){
            await createLink({originalUrl:"https://example.com/alias",alias:encodeBase62(permuteCounter(counter))});
        }
        const exhausted=await createUrl({originalUrl:"https://example.com"});
        assert.equal(exhausted.status,503);
        assert.equal(await getRedisClient().get(counterKey),"10");
        const legacy=await redirect("0000001");
        assert.equal(legacy.status,302);
        assert.equal(legacy.headers.get("location"),"https://example.com/legacy");
        assert.equal(await Url.countDocuments(),11);
    });

    test('a valid cache hit avoids MongoDB lookup and records its own click',async (context)=>{
        const link=await createLink();
        const lookup=context.mock.method(Url,"findOne");
        assert.equal((await redirect(link.code)).status,302);
        const key=cacheKey(link.code,cachePrefix);
        const entry=JSON.parse(await getRedisClient().get(key));
        assert.match(entry._id,/^[0-9a-f]{24}$/);
        assert.deepEqual(entry,{_id:entry._id,originalUrl:link.originalUrl,expiresAt:null});
        const firstTtl=await getRedisClient().pTTL(key);
        assert.ok(firstTtl>0 && firstTtl<=300000);
        const noLookup=context.mock.method(Url,"findOne",()=>{throw new Error("Cache hit must not query MongoDB");});
        assert.equal((await redirect(link.code,{'User-Agent':'cache-hit/1'})).status,302);
        assert.ok((await getRedisClient().pTTL(key))<=firstTtl);
        assert.deepEqual(lookup.mock.calls[0].arguments[0],{code:link.code});
        assert.equal(lookup.mock.callCount(),1);
        assert.equal(noLookup.mock.callCount(),0);
        const messages=await getRedisClient().xRange(streamKey,"-","+");
        assert.equal(messages.length,2);
        assert.equal(messages[1].message.userAgent,"cache-hit/1");
        assert.equal(messages[0].message.urlId,messages[1].message.urlId);
        assert.equal(messages[1].message.urlId,entry._id);
        noLookup.mock.restore();
        await startWorker();
        await eventually(async ()=>assert.equal((await getStats(link.code)).totalClicks,2));
    });

    test('invalidates a warm cache on deletion and redirects a reused alias to its new destination',async ()=>{
        const first=await createLink({originalUrl:"https://example.com/first",alias:"cache_1"});
        await redirect(first.code);
        const key=cacheKey(first.code,cachePrefix);
        assert.equal(await getRedisClient().exists(key),1);
        assert.equal((await request(`/api/urls/${first.code}`,{method:"DELETE"})).status,204);
        assert.equal(await getRedisClient().exists(key),0);
        assert.equal((await redirect(first.code)).status,404);
        const next=await createLink({originalUrl:"https://example.com/new",alias:first.code});
        const response=await redirect(next.code);
        assert.equal(response.headers.get("location"),next.originalUrl);
        const messages=await getRedisClient().xRange(streamKey,"-","+");
        assert.notEqual(messages[0].message.urlId,messages[1].message.urlId);
    });

    test('bounds the cache deadline by expiry and never caches already expired or unknown links',async (context)=>{
        const expiresAt=new Date(Date.now()+60000).toISOString();
        const link=await createLink({originalUrl:"https://example.com",expiresAt});
        assert.equal((await redirect(link.code)).status,302);
        const key=cacheKey(link.code,cachePrefix);
        assert.equal(await getRedisClient().pExpireTime(key),Date.parse(expiresAt));
        context.mock.method(Date,"now",()=>Date.parse(expiresAt)+1);
        assert.equal((await redirect(link.code)).status,410);
        assert.equal(await getRedisClient().exists(key),0);
        assert.equal((await redirect("not-saved")).status,404);
        assert.equal(await getRedisClient().exists(cacheKey("not-saved",cachePrefix)),0);
        assert.equal(await getRedisClient().xLen(streamKey),1);
    });

    test('returns 410 without a MongoDB lookup when an expired cached entry survives in Redis',async (context)=>{
        const link=await createLink();
        const expiresAt=new Date(Date.now()-1000);
        const key=cacheKey(link.code,cachePrefix);
        const saved=await Url.findOne({code:link.code});
        await getRedisClient().set(key,JSON.stringify({_id:saved._id.toString(),originalUrl:link.originalUrl,expiresAt:expiresAt.toISOString()}),{PX:10000});
        const lookup=context.mock.method(Url,"findOne",()=>{throw new Error("Expired cache hit must not query MongoDB");});
        assert.equal((await redirect(link.code)).status,410);
        assert.equal(lookup.mock.callCount(),0);
        assert.equal(await getRedisClient().exists(key),0);
        assert.equal(await getRedisClient().exists(streamKey),0);
    });

    test('falls back to MongoDB for cache read/write failures and corrupt entries',async (context)=>{
        context.mock.method(console,"error",()=>{});
        const link=await createLink();
        const client=getRedisClient();
        const saved=await Url.findOne({code:link.code});
        const validEntry={_id:saved._id.toString(),originalUrl:link.originalUrl,expiresAt:null};
        try{
            app.locals.redisClient=redisCommands({get:async ()=>{throw new Error("Cache GET failed");}});
            assert.equal((await redirect(link.code)).headers.get("location"),link.originalUrl);
            await client.del(cacheKey(link.code,cachePrefix));
            app.locals.redisClient=redisCommands({set:async ()=>{throw new Error("Cache SET failed");}});
            assert.equal((await redirect(link.code)).headers.get("location"),link.originalUrl);
            assert.equal(await client.exists(cacheKey(link.code,cachePrefix)),0);
            app.locals.redisClient=redisCommands({eval:async ()=>{throw new Error("Cache fill failed");}});
            assert.equal((await redirect(link.code)).headers.get("location"),link.originalUrl);
            assert.match(await client.get(cacheKey(link.code,cachePrefix)),/^loading:/);
            assert.ok((await client.pTTL(cacheKey(link.code,cachePrefix)))>0);
            app.locals.redisClient=client;
            for(const value of [
                'not-json',
                JSON.stringify({...validEntry,originalUrl:"javascript:alert(1)"}),
                JSON.stringify({...validEntry,expiresAt:"invalid"}),
                JSON.stringify({originalUrl:link.originalUrl,expiresAt:null}),
                JSON.stringify({...validEntry,_id:"invalid"})
            ]){
                await client.set(cacheKey(link.code,cachePrefix),value,{PX:10000});
                assert.equal((await redirect(link.code)).headers.get("location"),link.originalUrl);
            }
            assert.equal(await client.xLen(streamKey),8);
        }
        finally{
            app.locals.redisClient=client;
        }
    });

    test('failed initial invalidation leaves the URL intact and reports 503',async (context)=>{
        context.mock.method(console,"error",()=>{});
        const first=await createLink({originalUrl:"https://example.com/old",alias:"stale_1"});
        await redirect(first.code);
        const client=getRedisClient();
        try{
            app.locals.redisClient=redisCommands({set:async ()=>{throw new Error("Cache invalidation failed");}});
            const response=await request(`/api/urls/${first.code}`,{method:"DELETE"});
            assert.equal(response.status,503);
            assert.match((await response.json()).error,/deletion has not started/);
            assert.equal(await client.exists(cacheKey(first.code,cachePrefix)),1);
            assert.ok(await Url.findOne({code:first.code}));
            assert.equal((await redirect(first.code)).headers.get("location"),first.originalUrl);
        }
        finally{
            app.locals.redisClient=client;
        }
    });

    test('a delayed cache fill cannot revive a link after a completed deletion',async (context)=>{
        const link=await createLink();
        const findOne=Url.findOne.bind(Url);
        let releaseLookup;
        let signalLookup;
        const lookupStarted=new Promise((resolve)=>{signalLookup=resolve;});
        const lookupReleased=new Promise((resolve)=>{releaseLookup=resolve;});
        let firstLookup=true;
        context.mock.method(Url,"findOne",(filter)=>{
            if(!firstLookup){
                return findOne(filter);
            }
            firstLookup=false;
            return {lean:async ()=>{
                const saved=await findOne(filter).lean();
                signalLookup();
                await lookupReleased;
                return saved;
            }};
        });
        const inFlight=redirect(link.code);
        try{
            await lookupStarted;
            assert.equal((await request(`/api/urls/${link.code}`,{method:"DELETE"})).status,204);
        }
        finally{
            releaseLookup();
        }
        // The earlier read may finish, but requests after deletion must see 404.
        assert.equal((await inFlight).status,302);
        assert.equal(await getRedisClient().exists(cacheKey(link.code,cachePrefix)),0);
        assert.equal((await redirect(link.code)).status,404);
        assert.equal(await getRedisClient().exists(cacheKey(link.code,cachePrefix)),0);
    });

    test('failed cache cleanup leaves a deletion barrier and cannot redirect a deleted link',async (context)=>{
        context.mock.method(console,"error",()=>{});
        const link=await createLink();
        await redirect(link.code);
        const client=getRedisClient();
        try{
            app.locals.redisClient=redisCommands({eval:async ()=>{throw new Error("Cache cleanup failed");}});
            const response=await request(`/api/urls/${link.code}`,{method:"DELETE"});
            assert.equal(response.status,503);
            assert.match((await response.json()).error,/deletion completed/);
            assert.equal(await Url.findOne({code:link.code}),null);
            const key=cacheKey(link.code,cachePrefix);
            assert.match(await client.get(key),/^invalidating:/);
            assert.equal(await client.pTTL(key),-1);
            assert.equal((await redirect(link.code)).status,404);
            app.locals.redisClient=client;
            assert.equal((await request(`/api/urls/${link.code}`,{method:"DELETE"})).status,404);
            assert.equal(await client.exists(key),0);
        }
        finally{
            app.locals.redisClient=client;
        }
    });

    test('a MongoDB deletion failure keeps caching blocked until a safe retry',async (context)=>{
        context.mock.method(console,"error",()=>{});
        const link=await createLink();
        await redirect(link.code);
        const deletion=context.mock.method(Url,"findOneAndDelete",async ()=>{throw new Error("MongoDB deletion failed");});
        const response=await request(`/api/urls/${link.code}`,{method:"DELETE"});
        assert.equal(response.status,500);
        assert.match(await getRedisClient().get(cacheKey(link.code,cachePrefix)),/^invalidating:/);
        assert.equal((await redirect(link.code)).headers.get("location"),link.originalUrl);
        deletion.mock.restore();
        assert.equal((await request(`/api/urls/${link.code}`,{method:"DELETE"})).status,204);
        assert.equal((await redirect(link.code)).status,404);
    });

    test('an overlapping deletion cannot remove a replacement alias or leave its cache stale',async (context)=>{
        const first=await createLink({originalUrl:"https://example.com/old",alias:"overlap"});
        await redirect(first.code);
        const deleteDocument=Url.findOneAndDelete.bind(Url);
        let releaseDeletion;
        let signalDeletion;
        const deletionStarted=new Promise((resolve)=>{signalDeletion=resolve;});
        const deletionReleased=new Promise((resolve)=>{releaseDeletion=resolve;});
        let firstDeletion=true;
        context.mock.method(Url,"findOneAndDelete",async (filter)=>{
            if(firstDeletion){
                firstDeletion=false;
                signalDeletion();
                await deletionReleased;
            }
            return deleteDocument(filter);
        });
        const inFlight=request(`/api/urls/${first.code}`,{method:"DELETE"});
        let replacement;
        try{
            await deletionStarted;
            assert.equal((await request(`/api/urls/${first.code}`,{method:"DELETE"})).status,204);
            replacement=await createLink({originalUrl:"https://example.com/new",alias:first.code});
            assert.equal((await redirect(replacement.code)).headers.get("location"),replacement.originalUrl);
        }
        finally{
            releaseDeletion();
        }
        assert.equal((await inFlight).status,404);
        assert.equal((await Url.findOne({code:replacement.code})).originalUrl,replacement.originalUrl);
        assert.equal((await redirect(replacement.code)).headers.get("location"),replacement.originalUrl);
    });

    test('rate limits concurrent creation requests atomically and does not limit redirects or listing',async ()=>{
        app.locals.redirectSettings.rateLimit=3;
        const responses=await Promise.all(Array.from({length:10},()=>createUrl({originalUrl:"https://example.com"})));
        assert.equal(responses.filter((response)=>response.status===201).length,3);
        const limited=responses.filter((response)=>response.status===429);
        assert.equal(limited.length,7);
        for(const response of limited){
            const retryAfter=Number(response.headers.get("retry-after"));
            assert.ok(retryAfter>=1 && retryAfter<=60);
            assert.match((await response.json()).error,/Too many/);
        }
        assert.equal(await Url.countDocuments(),3);
        const key=rateKey("127.0.0.1",ratePrefix);
        assert.equal(await getRedisClient().get(key),"10");
        assert.ok((await getRedisClient().pTTL(key))>0);
        const link=await responses.find((response)=>response.status===201).json();
        for(let count=0;count<5;count++){
            assert.equal((await redirect(link.code)).status,302);
        }
        assert.equal((await request('/api/urls')).status,200);
        assert.equal(await getRedisClient().get(key),"10");
    });

    test('gives new windows an expiry and repairs a limiter key lacking expiry',async ()=>{
        app.locals.redirectSettings.rateLimit=1;
        app.locals.redirectSettings.rateWindowSeconds=2;
        const key=rateKey("127.0.0.1",ratePrefix);
        await getRedisClient().set(key,"1");
        const limited=await createUrl({originalUrl:"https://example.com"});
        assert.equal(limited.status,429);
        assert.ok(Number(limited.headers.get("retry-after"))<=2);
        const ttl=await getRedisClient().pTTL(key);
        assert.ok(ttl>0 && ttl<=2000);
        // Expire the window deterministically instead of waiting a minute.
        await getRedisClient().pExpireAt(key,Date.now()-1000);
        assert.equal((await createUrl({originalUrl:"https://example.com"})).status,201);
        assert.equal(await getRedisClient().get(key),"1");
        assert.ok((await getRedisClient().pTTL(key))>0);
    });

    test('counts invalid bodies and malformed JSON against the creation quota',async ()=>{
        app.locals.redirectSettings.rateLimit=2;
        assert.equal((await createUrl({originalUrl:"bad"})).status,400);
        const malformed=await request('/api/urls',{
            method:"POST",headers:{"Content-Type":"application/json"},body:'{"originalUrl":'
        });
        assert.equal(malformed.status,400);
        assert.equal((await createUrl({originalUrl:"https://example.com"})).status,429);
        assert.equal(await Url.countDocuments(),0);
        assert.equal(await getRedisClient().exists(counterKey),0);
    });

    test('ignores forged forwarded IPs by default and separates clients only through trusted proxies',async ()=>{
        app.locals.redirectSettings.rateLimit=1;
        async function createFrom(ip) {
            return request('/api/urls',{
                method:"POST",headers:{"Content-Type":"application/json","X-Forwarded-For":ip},
                body:JSON.stringify({originalUrl:"https://example.com"})
            });
        }
        assert.equal((await createFrom("192.0.2.1")).status,201);
        assert.equal((await createFrom("192.0.2.2")).status,429);
        app.set("trust proxy",["127.0.0.1"]);
        assert.equal((await createFrom("192.0.2.1")).status,201);
        assert.equal((await createFrom("192.0.2.2")).status,201);
        assert.equal((await createFrom("192.0.2.1")).status,429);
        assert.equal(await getRedisClient().get(rateKey("192.0.2.1",ratePrefix)),"2");
    });

    test('returns 503 and creates nothing when the Redis rate limiter fails',async (context)=>{
        context.mock.method(console,"error",()=>{});
        const client=getRedisClient();
        try{
            app.locals.redisClient=redisCommands({eval:async ()=>{throw new Error("Rate limiter failed");}});
            const response=await createUrl({originalUrl:"https://example.com",alias:"nolimit"});
            assert.equal(response.status,503);
            assert.match((await response.json()).error,/rate limiting/);
            assert.equal(response.headers.get("retry-after"),null);
            assert.equal(await Url.countDocuments(),0);
        }
        finally{
            app.locals.redisClient=client;
        }
    });

    test('keeps health and reserved API routes out of redirect analytics',async ()=>{
        const health=await request('/health',{redirect:"manual"});
        assert.equal(health.status,200);
        assert.deepEqual(await health.json(),{status:"ok"});
        for(const path of ["/api","/api/unknown"]){
            const response=await request(path,{redirect:"manual"});
            assert.equal(response.status,404);
        }
        assert.equal(await getRedisClient().exists(streamKey),0);
    });
});
