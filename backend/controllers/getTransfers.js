// routes/transfers.js
import express from 'express';
import axios from 'axios';

const router = express.Router();
let data = [];

// Get transfers route
const getTransfers = async (req, res) => {
  const apiKey = "R2dr5jjQAxHwg4LMc5RSGgfNvpN0uXGE";
  const { base, tokens, flow } = req.query;

  const url = 'https://api.arkhamintelligence.com/transfers';

  const querystring = {
    "base": "binance",
    "tokens": "usd-coin",
    "flow": "out",
  };

  try {
    const response = await axios.get(url, {
      headers: { 'API-Key': apiKey },
      params: querystring
    });
    
   

    res.status(200).json({data: response.data});

    // Add the response data to the 'data' array
    data.push(response.data);

    // Send the response back to the client
  } catch (error) {
    console.error('Error fetching transfers:', error.message);
    res.status(500).json({ error: error.message });
  }
};

const postTransfers = async(req, res) => {
  const apiKey = "R2dr5jjQAxHwg4LMc5RSGgfNvpN0uXGE";
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
    data.push(response.data);

    // Send the response back to the client
  } catch (error) {
    console.error('Error fetching transfers:', error.message);
    res.status(500).json({ error: error.message });
  }
}

// Delete transfers route
const deleteTransfers = async (req, res) => {
  try {
    // Clear all data in the cache
    data = [];
    console.log("Deleted all cached transfers data");

    // Send a confirmation response
    res.json({ message: "All cached transfers data deleted successfully." });
  } catch (error) {
    console.error('Error deleting cached transfers:', error.message);
    res.status(500).json({ error: error.message });
  }
};


export default {getTransfers, deleteTransfers, postTransfers};
