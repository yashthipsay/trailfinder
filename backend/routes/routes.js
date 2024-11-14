import express from 'express';
import getTransfers from '../controllers/getTransfers.js';
import getSwaps from '../controllers/swapController.js';
import getAddressTxns from '../controllers/getAddressTxns.js';
import getTokenVolume from '../controllers/getTokenVolume.js';
import getPortfolio from '../controllers/portfolio.js';
import getBtcData from '../controllers/getBtcData.js';

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

router.get('/tokenVolume', getTokenVolume.getTokenVolume);
router.post('/tokenVolume', getTokenVolume.postTokenVolume);
router.delete('/tokenVolume', getTokenVolume.deleteTokenVolume);

router.get('/portfolio/timeseries', getPortfolio.getPortfolioTimeSeries);
router.post('/portfolio/timeseries', getPortfolio.postPortfolioTimeSeries);
router.delete('/portfolio/timeseries', getPortfolio.deletePortfolioTimeSeries);

router.get('/btcData/:txid', getBtcData.getBtcData);


export default router;