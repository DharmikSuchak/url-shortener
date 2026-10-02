const alphabet = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

function encodeBase62(counter) {
    let value=BigInt(counter);
    let code="";

    if(value<0n || value>=62n ** 7n){
        throw new RangeError("Value cannot fit in a seven-character code");
    }

    while(value>0n){
        const remainder=value%62n;
        code=alphabet[Number(remainder)]+code;
        value=value/62n;
    }
    return code.padStart(7,"0");
}

module.exports=encodeBase62;
