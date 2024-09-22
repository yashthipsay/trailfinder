import express from 'express';
import getTransfers from '../controllers/getTransfers.js';
import getSwaps from '../controllers/swapController.js';
import getAddressTxns from '../controllers/getAddressTxns.js';


const router = express.Router();

let items = [];

router.get('/transfers', getTransfers.getTransfers);
router.post('/transfers', getTransfers.postTransfers);
router.delete('/transfers', getTransfers.deleteTransfers);

router.get('/swaps', getSwaps.getSwaps);
router.post('/swaps', getSwaps.postSwaps);
router.delete('/swaps', getSwaps.deleteSwaps);

router.get('/addressTxns', getAddressTxns.getAddressIntelligence);
router.post('/addressTxns', getAddressTxns.postAddressIntelligence);
router.delete('/addressTxns', getAddressTxns.deleteAddressIntelligence);




export default router;