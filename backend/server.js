import express from 'express';
import bodyParser from 'body-parser';
import { calldB } from './db/neo4jdriver.js';
import { initializeGraphqlServer } from './services/neo4jinstance.js';
import { traceFundFlow } from './services/etherscanService.js';
import getEventsByTransactionHash from './services/eventManager.js';
import cors from 'cors';
import router from './routes/routes.js';
const app = express();


const PORT = process.env.PORT || 4000;



const callDatabase = async () => {
    await calldB;
}

initializeGraphqlServer();
callDatabase();
traceFundFlow("0x307834c338866516DB9f5784aBc4C43484a8363a", new Set(), 1).then(() => {
    console.log('Fund flow tracing completed.');
})
// getEventsByTransactionHash("0x097bc327747779b129b959e6f1424275ae98502bba0a1706eb1bcfd3bd61b5ab")

const txHash = "0x4c954f24f4cf94e1ed1ce2d5d788eded98b3d873f0b06c07c44694300a1ba921";



app.use(
    cors({
      origin: "httplocalhost:3000",
    })
  );
  app.use(bodyParser.urlencoded({ extended: true }));
  app.use(bodyParser.json());
  
  app.use("/", router);

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    });



    