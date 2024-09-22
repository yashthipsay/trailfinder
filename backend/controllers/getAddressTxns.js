import axios from 'axios';
import dotenv from 'dotenv'
dotenv.config({
    path: '.env',
    debug: true,
    encoding: 'utf8',
}) // Replace with your actual API key

// In-memory cache for address data
let cachedData = {};
    const apiKey = `${process.env.ARKHAM_API_KEY}`
// GET request to fetch intelligence for an address
const getAddressIntelligence = async (req, res) => {
  const { address } = req.body;  // Get the address from the path parameter
  console.log(req.body)
  const url = `https://api.arkhamintelligence.com/intelligence/address/${address}/all`;

  try {
    // Call the external API to fetch intelligence data
    const response = await axios.get(url, {
      headers: { 'API-Key': apiKey }
    });

    // Cache the data
    cachedData[address] = response.data;

    // Return the fetched data
    res.status(200).json({ data: response.data });
  } catch (error) {
    console.error('Error fetching intelligence data:', error.message);
    res.status(500).json({ error: error.message });
  }
};

// POST request to manually add intelligence data for an address
const postAddressIntelligence = async (req, res) => {
  const { address } = req.params;  // Get the address from the path parameter
  const { arkhamEntity, arkhamLabel } = req.body;  // Get data from the request body

  try {
    // Store the posted data in the cache
    if (!cachedData[address]) {
      cachedData[address] = {};
    }
    
    // Save arkhamEntity and arkhamLabel in the cache
    cachedData[address].arkhamEntity = arkhamEntity;
    cachedData[address].arkhamLabel = arkhamLabel;

    res.status(201).json({
      message: "Intelligence data added successfully",
      data: cachedData[address]
    });
  } catch (error) {
    console.error('Error adding intelligence data:', error.message);
    res.status(500).json({ error: error.message });
  }
};

// DELETE request to remove cached intelligence data for an address
const deleteAddressIntelligence = async (req, res) => {
  const { address } = req.params;  // Get the address from the path parameter

  try {
    if (!cachedData[address]) {
      return res.status(404).json({ message: "No intelligence data found for this address" });
    }

    // Remove the cached data for the address
    delete cachedData[address];

    res.json({ message: "Intelligence data deleted successfully for the address" });
  } catch (error) {
    console.error('Error deleting intelligence data:', error.message);
    res.status(500).json({ error: error.message });
  }
};

export default { getAddressIntelligence, postAddressIntelligence, deleteAddressIntelligence };
