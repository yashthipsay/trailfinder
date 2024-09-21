import axios from "axios";

const getWalletTransfers = async() => {
    const apiKey = "R2dr5jjQAxHwg4LMc5RSGgfNvpN0uXGE"
    const querystring = {
        "base": "binance",
    "tokens": "usd-coin,binance-usd,tether,dai",
    "flow": "out",

    
    };

    const response = await axios.get(url, {
        headers: { 'API-Key': apiKey },
        params: querystring
    });

    return response.data;
}

export default getWalletTransfers;