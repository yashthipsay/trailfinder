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
// 0x307834c338866516DB9f5784aBc4C43484a8363a
// 0xEae7380dD4CeF6fbD1144F49E4D1e6964258A4F4
// 0xf9C0b9E489d8bb53B98bdfDc8B4cf13426a6bBcb
// getEventsByTransactionHash("0x1f87af615627d6d640e41bfb09438b9faa2ae92bf53b6565de41441e39a5325e")
// traceFundFlow("0xEae7380dD4CeF6fbD1144F49E4D1e6964258A4F4", new Set(), 1).then(() => {
//     console.log('Fund flow tracing completed.');
// })

// **********DATASET GENERATION**********

// const txHash = "0x4c954f24f4cf94e1ed1ce2d5d788eded98b3d873f0b06c07c44694300a1ba921";

// const seedAddresses = [
//   { address: '3D1xsYjkitAQR3MmgP5xyvs3vKNSiu7vot', isExchange: false }, 

// ];

// const generateDataset = new TransactionDatasetGenerator();

// generateDataset.generateDataset(seedAddresses, 10);


// **********BTC FLOW MAPPING**********
// const btcFlowMapper = new mapBtcFlow();
// const startAddress = 'bc1qv328hla8zswhxghakz80ukdp5haxkxahllhgd2';
// const MAX_DEPTH = 10;

// // bc1qqsa6ac4aeqf6h0xrfea9dj73khjxe8twu4el53g6ln8es9acmn2qddza00

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

const generateMixerDataset = new mapBtcFlow();
await generateMixerDataset.writePrecursorTransactionsToFile('0c2cb69195c090e1f4057d93ab368e5fbddc48b80e27dd6bb4c788b27d2aa302', 'tree_back.json', 30);
// 4eb717c3e79d70dea15c2cb5cf8470f271244bea2dac7f9ec1789ad4feec4054

await generateMixerDataset.writeSuccessorTransactionsToFile('0c2cb69195c090e1f4057d93ab368e5fbddc48b80e27dd6bb4c788b27d2aa302', 'tree_front.json', 30);

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



    