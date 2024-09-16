import express from 'express';
const app = express();
import { calldB } from './db/neo4jdriver.js';
import { initializeGraphqlServer } from './services/neo4jinstance.js';
import { traceFundFlow } from './services/etherscanService.js';
import getEventsByTransactionHash from './services/eventManager.js';
app.use(express.json());

const PORT = process.env.PORT || 5173;



const callDatabase = async () => {
    await calldB;
}

initializeGraphqlServer();
callDatabase();
// traceFundFlow("0x2bE61E9625E3b358157F42D940d528b51f4b9697", new Set(), 1).then(() => {
//     console.log('Fund flow tracing completed.');
// })

const txHash = "0x4c954f24f4cf94e1ed1ce2d5d788eded98b3d873f0b06c07c44694300a1ba921";

getEventsByTransactionHash(txHash);



app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    });



    