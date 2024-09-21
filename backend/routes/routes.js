import express from 'express';
import getTransfers from '../controllers/getTransfers.js';
import deleteTransfers from '../controllers/deleteTransfers.js';

const router = express.Router();

let items = [];

router.get('/transfers', getTransfers.getTransfers);
router.post('/transfers', getTransfers.postTransfers);
router.delete('/transfers', getTransfers.deleteTransfers);


export default router;