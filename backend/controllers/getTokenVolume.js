import axios from 'axios';

import dotenv from 'dotenv'
dotenv.config({
    path: '.env',
    debug: true,
    encoding: 'utf8',
}) // Replace with your actual API key
const apiKey = `${process.env.ARKHAM_API_KEY}`;  // Replace with your actual API key
let cachedTokenVolumeData = [];  // Cache for token volume data

// POST: Fetch token volume by ID and store it in cache
const postTokenVolume = async (req, res) => {
  const { id, timeLast, granularity } = req.body;  // Only id, timeLast, and granularity are accepted

  try {
    // Construct the URL using only the id
    const url = `https://api.arkhamintelligence.com/token/volume/${id}`;

    // Make the API request
    const response = await axios.get(url, {
      headers: { 'API-Key': apiKey },
      params: { timeLast, granularity }  // Pass timeLast and granularity as query parameters
    });

    // Cache the response data
    cachedTokenVolumeData.push({
      id,
      data: response.data
    });

    // Return the response data
    res.status(200).json(response.data);
  } catch (error) {
    console.error('Error fetching token volume:', error.message);
    res.status(500).json({ error: error.message });
  }
};

// GET: Retrieve cached token volume based on ID
const getTokenVolume = async (req, res) => {
  const { id } = req.body;  // Only id is accepted

  try {
    // Check if id is provided
    if (!id) {
      return res.status(400).json({ message: "ID must be provided." });
    }

    // Filter the cached data based on id
    const cachedData = cachedTokenVolumeData.find(item => item.id === id);

    if (!cachedData) {
      return res.status(404).json({ message: "No cached data found for the provided ID." });
    }

    // Return the cached data
    res.status(200).json(cachedData.data);
  } catch (error) {
    console.error('Error retrieving token volume:', error.message);
    res.status(500).json({ error: error.message });
  }
};

// DELETE: Clear cached token volume data for a specific ID
const deleteTokenVolume = async (req, res) => {
  const { id } = req.body;  // Only id is accepted

  try {
    // Check if id is provided
    if (!id) {
      return res.status(400).json({ message: "ID must be provided." });
    }

    // Remove the cached data for the given ID
    const index = cachedTokenVolumeData.findIndex(item => item.id === id);
    
    if (index === -1) {
      return res.status(404).json({ message: "No cached data found for the provided ID." });
    }

    cachedTokenVolumeData.splice(index, 1);  // Remove the cached entry

    console.log(`Deleted cached data for ID: ${id}`);
    res.json({ message: `Cached data for ID ${id} deleted successfully.` });
  } catch (error) {
    console.error('Error deleting cached token volume data:', error.message);
    res.status(500).json({ error: error.message });
  }
};

export default { postTokenVolume, getTokenVolume, deleteTokenVolume };
