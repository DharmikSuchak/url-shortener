const encodeBase62=require('./base62');
const nextCounter=require('./nextCounter');
const {permuteCounter,CODE_DOMAIN}=require('./permuteCounter');

async function generateCode(client) {
    const number=await nextCounter(client);
    if(!Number.isSafeInteger(number) || number<1 || BigInt(number)>=CODE_DOMAIN){
        const error=new Error("The short URL counter has exhausted the code domain");
        error.code="CODE_ALLOCATION_EXHAUSTED";
        throw error;
    }

    return encodeBase62(permuteCounter(number));
}

module.exports=generateCode;
