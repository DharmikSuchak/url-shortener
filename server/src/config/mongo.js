const mongoose=require('mongoose');

async function connectMongoDB() {
    const mongoUri=process.env.MONGODB_URI;

    if(!mongoUri){
        throw new Error("MONGODB_URI is required");
    }

    await mongoose.connect(mongoUri);

    console.log("MongoDB connected");
}

module.exports=connectMongoDB;
