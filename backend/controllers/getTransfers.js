// routes/transfers.js
import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv'
dotenv.config({
  path: '.env',
  debug: true,
  encoding: 'utf8',
})

const router = express.Router();
let cachedData = [];

const postTransfers = async(req, res) => {
  const apiKey = `${process.env.ARKHAM_API_KEY}`;
  const { base, tokens, flow } = req.body;
  console.log(req.body)

  const url = 'https://api.arkhamintelligence.com/transfers';

  const querystring = {
    base,
    tokens,
    flow
  };

  try {
    const response = await axios.get(url, {
      headers: { 'API-Key': apiKey },
      params: querystring
    });
    
   
    
    res.status(200).json({data: response.data});

    // Add the response data to the 'data' array
    cachedData.push(response.data);

    // Send the response back to the client
  } catch (error) {
    console.error('Error fetching transfers:', error.message);
    res.status(500).json({ error: error.message });
  }
}

// Get transfers route
const getTransfers = async (req, res) => {
  const { transactionHash } = req.body;  // Get the transactionHash from the request query parameters

  try {
    // Check if the transactionHash is provided
    if (!transactionHash) {
      return res.status(400).json({ message: "Missing required parameter: transactionHash" });
    }

    // Filter the cached data based on transactionHash
    const filteredTransfers = cachedData.flatMap(item => item.transfers || []).filter(
      transfer => transfer.transactionHash === transactionHash
    );

    if (filteredTransfers.length === 0) {
      return res.status(404).json({ message: "No transfers found for the provided transactionHash" });
    }

    // Send the filtered transfers back to the client
    res.json(filteredTransfers);
  } catch (error) {
    console.error('Error retrieving transfers:', error.message);
    res.status(500).json({ error: error.message });
  }
};



// Delete transfers route
const deleteTransfers = async (req, res) => {
  try {
    // Clear all data in the cache
    cachedData = [];
    console.log("Deleted all cached transfers data");

    // Send a confirmation response
    res.json({ message: "All cached transfers data deleted successfully." });
  } catch (error) {
    console.error('Error deleting cached transfers:', error.message);
    res.status(500).json({ error: error.message });
  }
};


export default {getTransfers, deleteTransfers, postTransfers};
