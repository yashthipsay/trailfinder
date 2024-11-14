import express, { application } from 'express';
import axios from 'axios';


const BASE_URL = 'https://btcscan.org/api';
const endpoints = {
    transactionDetails: (txid) => `${BASE_URL}/tx/${txid}`,
    outspends: (txid) => `${BASE_URL}/tx/${txid}/outspends`,
    feeEstimates: `${BASE_URL}/fee-estimates`,
    mempool: `${BASE_URL}/mempool`
};


// Function to fetch data concurrently with axios
const getBtcData = async (req, res) => {
    const { txid } = req.params;
    try{
        const [transactionDetails, outspends, feeEstimates, mempool] = await axios.all([
            axios.get(endpoints.transactionDetails(txid)),
            axios.get(endpoints.outspends(txid)),
            axios.get(endpoints.outspends(txid)),
            axios.get(endpoints.feeEstimates),
            axios.get(endpoints.mempool)
        ]);

        res.status(200).json({
            transactionDetails: transactionDetails.data,
            outspends: outspends.data,
            feeEstimates: feeEstimates.data,
            mempool: mempool.data
        });
    } catch(error) {
        res.status(500).json({ error: error.message });
    }
}

export default {getBtcData};
