import axios from 'axios';
let cachedTransfers;
const deleteTransfers = async (req, res) => {
    try {
        // Clear all data in the cache
        cachedTransfers = [];
        console.log("Deleted all cached transfers data");

        // Send a confirmation response
        res.json(cachedTransfers);
    } catch (error) {
        console.error('Error deleting cached transfers:', error.message);
        res.status(500).json({ error: error.message });
    }
};

export default deleteTransfers;