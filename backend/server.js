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
import axios from 'axios';
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

const txHash = "0x4c954f24f4cf94e1ed1ce2d5d788eded98b3d873f0b06c07c44694300a1ba921";

const seedAddresses = [
  { address: '1NRy8GbX56MymBhDYMyqsNKwW9VupqKVG7', isExchange: false }, 

];

const generateDataset = new TransactionDatasetGenerator();
const data = await generateDataset.generateJsonData(seedAddresses, 40);
const postData = async (data) => {  // Define a function for posting data

  try {
    const responses = [];
      for (const transaction of data) {  // Loop through each transaction object
          const response = await axios.post('http://localhost:8000/single-entry', transaction); // Post individual transaction
          console.log('Response from server:', response.data);  // Log the response for debugging
          responses.push(response.data);  // Store response data
      }

      return responses;

  } catch (error) {
      console.error('Error posting data:', error);
      return []; // Return an empty array in case of error
  }
}


const postResults = await postData(data);  // Post the transaction data
// console.log("Post results:", postResults);

// generateDataset.generateDataset(seedAddresses, 10);


// **********BTC FLOW MAPPING**********
// const btcFlowMapper = new mapBtcFlow();
// const startAddress = 'bc1qqsa6ac4aeqf6h0xrfea9dj73khjxe8twu4el53g6ln8es9acmn2qddza00';
// const MAX_DEPTH = 10;

// bc1qv328hla8zswhxghakz80ukdp5haxkxahllhgd2
// bc1qqsa6ac4aeqf6h0xrfea9dj73khjxe8twu4el53g6ln8es9acmn2qddza00

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
// await generateMixerDataset.writePrecursorLayersToFile('bbefefd2f5da927a570213c8e98418ebdff4deebf48726ceabdd1ea58655f654', 'tree_back.json', 10);
// 4eb717c3e79d70dea15c2cb5cf8470f271244bea2dac7f9ec1789ad4feec4054

// await generateMixerDataset.writeSuccessorLayersToFile('823a18cdd015a2c5a7be6517a0e9ebfe022532d8170141e5a880c67bda82c724', 'tree_front.json', 30);

app.use(
    cors({
      origin: "http://localhost:3000",
    })
  );
  app.use(bodyParser.urlencoded({ extended: true }));
  app.use(bodyParser.json());
  
  app.use("/", router);

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    });



    