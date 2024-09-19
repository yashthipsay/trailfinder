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
// traceFundFlow("0xf48a9308f6326284FF329A9E1ee8C9b73F94518e", new Set(), 0).then(() => {
//     console.log('Fund flow tracing completed.');
// })
getEventsByTransactionHash("0x097bc327747779b129b959e6f1424275ae98502bba0a1706eb1bcfd3bd61b5ab")

const txHash = "0x4c954f24f4cf94e1ed1ce2d5d788eded98b3d873f0b06c07c44694300a1ba921";





app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    });



    