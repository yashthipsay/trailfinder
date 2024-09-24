import axios from 'axios';
import dotenv from 'dotenv'
dotenv.config({
    path: '.env',
    debug: true,
    encoding: 'utf8',
}) // Replace with your actual API key

const apiKey = `${process.env.ARKHAM_API_KEY}`;  // Replace with your actual API key
let cachedPortfolioData = [];  // Cache for portfolio time series data

// POST: Fetch and cache the portfolio time series by entity or address
const postPortfolioTimeSeries = async (req, res) => {
  const { entity, address, pricingId } = req.body;  // Only entity, address, and pricingId are accepted

  try {
    // Construct the URL based on whether 'entity' or 'address' is provided
    let url;
    if (entity) {
      url = `https://api.arkhamintelligence.com/portfolio/timeSeries/entity/${entity}`;
    } else if (address) {
      url = `https://api.arkhamintelligence.com/portfolio/timeSeries/address/${address}`;
    } else {
      return res.status(400).json({ message: "Either 'entity' or 'address' must be provided." });
    }

    // Make the API request
    const response = await axios.get(url, {
      headers: { 'API-Key': apiKey },
      params: { pricingId }
    });

    // Cache the response data
    cachedPortfolioData.push({
      entityOrAddress: entity || address,
      data: response.data
    });

    // Return the response data
    res.status(200).json(response.data);
  } catch (error) {
    console.error('Error fetching portfolio time series:', error.message);
    res.status(500).json({ error: error.message });
  }
};

// GET: Retrieve cached portfolio time series based on entity or address
const getPortfolioTimeSeries = async (req, res) => {
  const { entity, address } = req.body;  // Only entity or address is accepted

  try {
    // Check if either entity or address is provided
    if (!entity && !address) {
      return res.status(400).json({ message: "Either 'entity' or 'address' must be provided." });
    }

    // Filter the cached data based on entity or address
    const cachedData = cachedPortfolioData.find(item => item.entityOrAddress === (entity || address));

    if (!cachedData) {
      return res.status(404).json({ message: "No cached data found for the provided entity or address." });
    }

    // Return the cached data
    res.status(200).json(cachedData.data);
  } catch (error) {
    console.error('Error retrieving portfolio time series:', error.message);
    res.status(500).json({ error: error.message });
  }
};

// DELETE: Clear cached portfolio time series data for a specific entity or address
const deletePortfolioTimeSeries = async (req, res) => {
  const { entity, address } = req.body;  // Only entity or address is accepted

  try {
    // Check if entity or address is provided
    if (!entity && !address) {
      return res.status(400).json({ message: "Either 'entity' or 'address' must be provided." });
    }

    // Remove the cached data for the given entity or address
    const index = cachedPortfolioData.findIndex(item => item.entityOrAddress === (entity || address));

    if (index === -1) {
      return res.status(404).json({ message: "No cached data found for the provided entity or address." });
    }

    cachedPortfolioData.splice(index, 1);  // Remove the cached entry

    console.log(`Deleted cached data for entity/address: ${entity || address}`);
    res.json({ message: `Cached data for entity/address ${entity || address} deleted successfully.` });
  } catch (error) {
    console.error('Error deleting cached portfolio time series data:', error.message);
    res.status(500).json({ error: error.message });
  }
};

export default { postPortfolioTimeSeries, getPortfolioTimeSeries, deletePortfolioTimeSeries };
