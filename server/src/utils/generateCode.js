const base62=require('./base62');
const nextCounter=require('./nextCounter');

async function generateCode(client) {
    const number=await nextCounter(client);
    const newcode=base62(number);
    return newcode;
}

module.exports=generateCode;