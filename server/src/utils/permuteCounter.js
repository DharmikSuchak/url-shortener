const CODE_DOMAIN=62n ** 7n;
const MULTIPLIER=1103515245n;
const OFFSET=25214903917n;

function permuteCounter(counter) {
    const value=BigInt(counter);
    if(value<0n || value>=CODE_DOMAIN){
        throw new RangeError("Counter is outside the seven-character code domain");
    }

    // The multiplier is odd and not divisible by 31, so it is coprime to 62^7.
    return (MULTIPLIER*value+OFFSET)%CODE_DOMAIN;
}

module.exports={permuteCounter,CODE_DOMAIN,MULTIPLIER,OFFSET};
