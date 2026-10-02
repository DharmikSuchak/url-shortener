const mongoose=require('mongoose');
const {Schema}=mongoose;

const clickSchema=new Schema({
    _id:{type:String,required:true},
    urlId:{type:Schema.Types.ObjectId,required:true},
    code:{type:String,required:true},
    timestamp:{type:Date,required:true},
    userAgent:{type:String,default:""},
    referrer:{type:String,default:""}
});

clickSchema.index({urlId:1,timestamp:-1,_id:-1});

module.exports=mongoose.model("Click",clickSchema);
