// routes/swaps.js
import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv'
dotenv.config({
    path: '.env',
    debug: true,
    encoding: 'utf8',
})

const router = express.Router();
let cachedSwapsData = [];  // Cache for swaps data

const apiKey = `${process.env.ARKHAM_API_KEY}`;  // Replace with your actual API key

// POST request to fetch swaps
const postSwaps = async (req, res) => {
  const { base, sold, bought, counterparties, protocols, flow, limit, offset, usdGte } = req.body;

  const url = 'https://api.arkhamintelligence.com/swaps';

  const querystring = {
    base,
    sold,
    bought,
    counterparties,
    protocols,
    flow,
    limit,
    offset,
    usdGte
  };

  try {
    const response = await axios.get(url, {
      headers: { 'API-Key': apiKey },
      params: querystring
    });

    res.status(200).json({ data: response.data });

    // Add the response data to the cache
    cachedSwapsData.push(response.data);
  } catch (error) {
    console.error('Error fetching swaps:', error.message);
    res.status(500).json({ error: error.message });
  }
};

// GET request to retrieve cached swaps based on blockHash
const getSwaps = async (req, res) => {
  const { blockHash } = req.body;  // Get the blockHash from req.body

  try {
    // Check if blockHash is provided
    if (!blockHash) {
      return res.status(400).json({ message: "Missing required parameter: blockHash" });
    }

    // Filter the cached swaps data based on blockHash
    const filteredSwaps = cachedSwapsData.flatMap(item => item.swaps || []).filter(
      swap => swap.blockHash === blockHash
    );

    if (filteredSwaps.length === 0) {
      return res.status(404).json({ message: "No swaps found for the provided blockHash" });
    }

    // Send the filtered swaps back to the client
    res.json(filteredSwaps);
  } catch (error) {
    console.error('Error retrieving swaps:', error.message);
    res.status(500).json({ error: error.message });
  }
};

// DELETE request to clear the cache
const deleteSwaps = async (req, res) => {
  try {
    cachedSwapsData = [];  // Clear the cache
    console.log("Deleted all cached swaps data");

    res.json({ message: "All cached swaps data deleted successfully." });
  } catch (error) {
    console.error('Error deleting cached swaps:', error.message);
    res.status(500).json({ error: error.message });
  }
};

export default { postSwaps, getSwaps, deleteSwaps };
