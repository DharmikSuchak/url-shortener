async function nextCounter(client) {
     const nextValue = await client.incr("short-url:counter");
     return nextValue;
}

module.exports=nextCounter;