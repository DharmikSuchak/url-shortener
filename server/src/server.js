require('dotenv').config();

const app=require('./app');
const connectMongoDB=require('./config/mongo');
const connectRedis=require('./config/redis');
const getBaseUrl=require('./config/baseUrl');
const Url=require('./models/url');
// const nextCounter=require('./utils/nextCounter');
// const generateCode=require('./utils/generateCode');

const PORT=Number(process.env.PORT) || 3000;


async function startServer() {
  try {
    app.locals.baseUrl=getBaseUrl();
    await connectMongoDB();
    await Url.init();
    const redisClient=await connectRedis();
    app.locals.redisClient=redisClient;

    app.listen(PORT, () => {
      console.log(`Server is running at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error.message);
    process.exit(1);
  }
}




startServer();
