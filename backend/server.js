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

initializeGraphqlServer();

// initializeBtcNeo4jServer();
callDatabase();
// 0x307834c338866516DB9f5784aBc4C43484a8363a
// 0xEae7380dD4CeF6fbD1144F49E4D1e6964258A4F4
// getEventsByTransactionHash("0x1f87af615627d6d640e41bfb09438b9faa2ae92bf53b6565de41441e39a5325e")
traceFundFlow("0xcA74F404E0C7bfA35B13B511097df966D5a65597", new Set(), 1).then(() => {
    console.log('Fund flow tracing completed.');
})

// **********DATASET GENERATION**********

// const txHash = "0x4c954f24f4cf94e1ed1ce2d5d788eded98b3d873f0b06c07c44694300a1ba921";

// const seedAddresses = [
//   { address: '3D1xsYjkitAQR3MmgP5xyvs3vKNSiu7vot', isExchange: false }, 

// ];

// const generateDataset = new TransactionDatasetGenerator();

// generateDataset.generateDataset(seedAddresses, 10);


// **********BTC FLOW MAPPING**********
// const btcFlowMapper = new mapBtcFlow();
// const startAddress = 'bc1qqsa6ac4aeqf6h0xrfea9dj73khjxe8twu4el53g6ln8es9acmn2qddza00';
// const MAX_DEPTH = 3;

// btcFlowMapper
//      .startMapping(startAddress, MAX_DEPTH)
//      .then(() => {
//       console.log('BTC flow mapping completed.');
//       return btcFlowMapper.driver.close();
//      })
//      .catch((error) => {
//       console.error("Error during tracing:", error);
//       return btcFlowMapper.driver.close();
//     });


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



    