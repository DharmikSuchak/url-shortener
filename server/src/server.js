require('dotenv').config();

const app=require('./app');
const connectMongoDB=require('./config/mongo');
const connectRedis=require('./config/redis');

const PORT=Number(process.env.PORT) || 3000;


async function startServer() {
  try {
    await connectMongoDB();
    await connectRedis();

    app.listen(PORT, () => {
      console.log(`Server is running at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error.message);
    process.exit(1);
  }
}



startServer();
