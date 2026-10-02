const COUNTER_KEY=process.env.URL_COUNTER_KEY || "short-url:counter";

async function nextCounter(client) {
    return client.incr(COUNTER_KEY);
}

module.exports=nextCounter;
