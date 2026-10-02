const assert=require('node:assert/strict');
const {test}=require('node:test');
const encodeBase62=require('../src/utils/base62');
const {permuteCounter,CODE_DOMAIN,MULTIPLIER,OFFSET}=require('../src/utils/permuteCounter');

function greatestCommonDivisor(left,right) {
    while(right!==0n){
        [left,right]=[right,left%right];
    }
    return left;
}

function modularInverse(value,modulus) {
    let [remainder,nextRemainder]=[modulus,value];
    let [coefficient,nextCoefficient]=[0n,1n];
    while(nextRemainder!==0n){
        const quotient=remainder/nextRemainder;
        [remainder,nextRemainder]=[nextRemainder,remainder-quotient*nextRemainder];
        [coefficient,nextCoefficient]=[nextCoefficient,coefficient-quotient*nextCoefficient];
    }
    return (coefficient+modulus)%modulus;
}

test('fixed affine parameters are invertible over the entire Base62 domain',()=>{
    assert.equal(CODE_DOMAIN,3521614606208n);
    assert.equal(MULTIPLIER,1103515245n);
    assert.equal(OFFSET,25214903917n);
    assert.equal(greatestCommonDivisor(MULTIPLIER,CODE_DOMAIN),1n);
    const inverse=modularInverse(MULTIPLIER,CODE_DOMAIN);
    for(const value of [0n,1n,31n,62n,CODE_DOMAIN/2n,CODE_DOMAIN-2n,CODE_DOMAIN-1n]){
        const permuted=permuteCounter(value);
        assert.ok(permuted>=0n && permuted<CODE_DOMAIN);
        assert.equal(((permuted-OFFSET+CODE_DOMAIN)*inverse)%CODE_DOMAIN,value);
        assert.match(encodeBase62(permuted),/^[0-9a-zA-Z]{7}$/);
    }
});

test('permutation is deterministic and produces distinct values across consecutive counters',()=>{
    const results=new Set();
    for(let value=0n;value<10000n;value++){
        const code=encodeBase62(permuteCounter(value));
        assert.equal(permuteCounter(value),permuteCounter(value.toString()));
        results.add(code);
    }
    assert.equal(results.size,10000);
    assert.equal(permuteCounter(1n),26318419162n);
});

test('permutation and Base62 reject out-of-domain values instead of wrapping',()=>{
    for(const value of [-1n,CODE_DOMAIN,CODE_DOMAIN+1n]){
        assert.throws(()=>permuteCounter(value),RangeError);
        assert.throws(()=>encodeBase62(value),RangeError);
    }
});
