const generateCode=require('./generateCode');
const Url=require('../models/url');

const MAX_CODE_ATTEMPTS=10;

function isCodeConflict(error) {
    return error.code===11000 && error.keyPattern?.code===1;
}

async function createUrl(redisClient,{originalUrl,expiresAt,alias}) {
    if(alias!==undefined){
        return Url.create({code:alias,originalUrl,expiresAt});
    }

    for(let attempt=0;attempt<MAX_CODE_ATTEMPTS;attempt++){
        const code=await generateCode(redisClient);

        try{
            return await Url.create({code,originalUrl,expiresAt});
        }
        catch(error){
            // The unique index also catches aliases claimed after a code is generated.
            if(!isCodeConflict(error)){
                throw error;
            }
        }
    }

    const error=new Error("Could not allocate an available short URL code");
    error.code="CODE_ALLOCATION_EXHAUSTED";
    throw error;
}

module.exports={createUrl,isCodeConflict};
