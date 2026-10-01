const mongoose=require('mongoose');
const {Schema}=mongoose;

const urlSchema=new Schema(
    {
        code: {
            type: String,
            required: true,
            unique: true,
        },
        originalUrl: {
            type: String,
            required: true,
        },
        expiresAt: {
            type: Date
        }
    },
    {
        timestamps:true
    }
);

const Url=mongoose.model("Url",urlSchema);

module.exports=Url;