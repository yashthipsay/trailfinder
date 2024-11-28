import express from 'express';
import bodyParser from 'body-parser';
import { calldB } from './db/neo4jdriver.js';
import { initializeGraphqlServer } from './services/neo4jinstance.js';
import { traceFundFlow } from './services/etherscanService.js';
import getEventsByTransactionHash from './services/eventManager.js';
import TransactionDatasetGenerator from './services/generateDataset.js';
import mapBtcFlow from './services/mapBtcFlow.js';
import cors from 'cors';
import router from './routes/routes.js';
import { initializeBtcNeo4jServer } from './services/btcNeoInstance.js';
const app = express();


const PORT = process.env.PORT || 4000;



const callDatabase = async () => {
    await calldB;
}

// initializeGraphqlServer();

initializeBtcNeo4jServer();
callDatabase();
// traceFundFlow("0x307834c338866516DB9f5784aBc4C43484a8363a", new Set(), 1).then(() => {
//     console.log('Fund flow tracing completed.');
// })
// getEventsByTransactionHash("0x097bc327747779b129b959e6f1424275ae98502bba0a1706eb1bcfd3bd61b5ab")

// **********DATASET GENERATION**********

// const txHash = "0x4c954f24f4cf94e1ed1ce2d5d788eded98b3d873f0b06c07c44694300a1ba921";

// const seedAddresses = [
//   { address: 'bc1q3v9gql2t2lltn4rgs8e4g9wu03r65kctvqtpg7', isExchange: false }, 

// ];

// const generateDataset = new TransactionDatasetGenerator();

// generateDataset.generateDataset(seedAddresses, 100);


// **********BTC FLOW MAPPING**********
const btcFlowMapper = new mapBtcFlow();
const startAddress = 'bc1qqsa6ac4aeqf6h0xrfea9dj73khjxe8twu4el53g6ln8es9acmn2qddza00';
const MAX_DEPTH = 3;

btcFlowMapper
     .startMapping(startAddress, MAX_DEPTH)
     .then(() => {
      console.log('BTC flow mapping completed.');
      return btcFlowMapper.driver.close();
     })
     .catch((error) => {
      console.error("Error during tracing:", error);
      return btcFlowMapper.driver.close();
    });


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



    