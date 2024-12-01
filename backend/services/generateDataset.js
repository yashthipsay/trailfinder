import axios from 'axios';
import fs from 'fs/promises';
import csv from 'csv-writer';
import Websocket from 'ws';
import { title } from 'process';



const BTCSCAN_BASE_URL = 'https://btcscan.org/api';
const ARKHAM_BASE_URL = 'https://api.arkhamintelligence.com';

// Sleep function for rate limiting
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

class TransactionDatasetGenerator {
    constructor() {
        this.transactions = new Map();
        this.addresses = new Set();
        this.relationships = [];
        this.rateLimitDelay = 500; // 1 seconds delay between requests
        this.websocket = null;
        this.createCsvWriter = csv.createObjectCsvWriter({
            path: 'transaction_dataset.csv',
            header: [
                {id: 'txid', title: 'transaction_hash'},
                {id: 'transactionIndex', title: 'transaction_index'},
                {id: 'blockhash', title: 'block_hash'},
                {id: 'blockheight', title: 'block_height'},
                {id: 'blocktime', title: 'block_time'},
                {id: 'historicalusdprice', title: 'historical_usd_price'},
                {id: 'from', title: 'from'},
                {id: 'fromchain', title: 'from_chain'},
                {id: 'to', title: 'to'},
                {id: 'tochain', title: 'to_chain'},
                {id: 'type', title: 'type'},
                {id: 'timestamp', title: 'timestamp'},
                {id: 'indegree', title: 'indegree'},
                {id: 'outdegree', title: 'outdegree'},
                {id: 'in_btc', title: 'in_btc'},
                {id: 'out_btc', title: 'out_btc'},
                {id: 'total_btc', title: 'total_btc'},
                {id: 'mean_in_btc', title: 'mean_in_btc'},
                {id: 'mean_out_btc', title: 'mean_out_btc'},
                {id: 'is_exchange', title: 'is_exchange'},  // Flag for exchange addresses
                {id: 'cluster_label', title: 'cluster_label'}  // For labeling transaction patterns
            ]
        });
    }

    // Rate limited request function
    async makeRateLimitedRequest(url) {
        try {
            const response = await axios.get(url);
            await sleep(50); // 2 second delay after each request
            return response.data;
        } catch (error) {
            if (error.response?.status === 429) {
                console.log('Rate limit hit, waiting few seconds...');
                await sleep(7000);
                return this.makeRateLimitedRequest(url); // Retry the request
            }
            throw error;
        }
    }

    // https://api.arkhamintelligence.com/intelligence/address/${address}?chain=${chain}

    async getEntityType(address, chain) {
        const apiKey = `${process.env.ARKHAM_API_KEY}`;
        try {
            const response = await axios.get(`https://api.arkhamintelligence.com/intelligence/address/${address}`, {
                headers: { 'API-Key': apiKey },
                params: {chain}
            });
            console.log(response.data.arkhamEntity.type);
            return response.data.arkhamEntity.type;
        } catch (error) {
           return null;
        }
    }

    async fetchAddressTransactions(address) {
        let transactions = [];
        let lastSeenTxid = null;

        while(transactions.length < 10) {

            try {
                const url = `${BTCSCAN_BASE_URL}/address/${address}/txs/chain${
                    lastSeenTxid ? `/${lastSeenTxid}` : ""
                }`;
    
                // Fetch data
                const data = await this.makeRateLimitedRequest(url);
                if(!data || data.length === 0) {
                    break;
                }

                // Append transactions
                transactions = transactions.concat(data);

                // Update last seen txid
                lastSeenTxid = data[data.length - 1]?.txid;

                // Stop if fewer than 25 transactions are returned (last page)
            if (data.length < 25) break;

                } catch (error) {
                    console.error(`Error fetching transactions for address ${address}:`, error.message);
                    break;
                }
            }
            return transactions.slice(0, 1000);
    }

    async fetchTransactionDetails(txid) {
        try {
            return await this.makeRateLimitedRequest(`${BTCSCAN_BASE_URL}/tx/${txid}`);
        } catch (error) {
            console.error(`Error fetching transaction ${txid}:`, error.message);
            return null;
        }
    }
    /*
    async fetchArkhamDetails() {
        try{
            return await this
        }
    }
    */ 


    calculateMetrics(transaction) {
        const inputs = transaction.vin || [];
        const outputs = transaction.vout || [];

        const indegree = inputs.length;
        const outdegree = outputs.length;

        const in_btc = inputs.reduce((sum, input) => sum + (input.prevout?.value || 0), 0);
        const out_btc = outputs.reduce((sum, output) => sum + (output.value || 0), 0);

        return {
            txid: transaction.txid,
            timestamp: transaction.status.block_time,
            indegree,
            outdegree,
            in_btc,
            out_btc,
            total_btc: in_btc + out_btc,
            mean_in_btc: indegree > 0 ? in_btc / indegree : 0,
            mean_out_btc: outdegree > 0 ? out_btc / outdegree : 0,
            is_exchange: false,  // Will be updated based on patterns
            cluster_label: 0     // Will be updated based on analysis
        };
    }

    async getArkhamTxDetails(txid) {
        const apiKey = `${process.env.ARKHAM_API_KEY}`;
        const baseurl = `${ARKHAM_BASE_URL}/tx/${txid}`;

        try{
            const response = await axios.get(baseurl, {
                headers: { 'API-Key': apiKey }
        });

        const tx = response.data.bitcoin;

        // Return only the necessary values with fallback to "NA"

        return {
            transactionIndex: tx.transactionIndex || 'NA',
            blockhash: tx.blockHash || 'NA',
            blockheight: tx.blockHeight || 'NA',
            blocktime: tx.blockTimestamp || 'NA',
            historicalusdprice: tx.inputUSD || 'NA',
            from: tx.inputs?.[0]?.address?.address || 'NA',
            fromchain: tx.inputs?.[0]?.address?.chain || 'NA',
            to: tx.outputs?.[0]?.address?.address || 'NA',
            tochain: tx.outputs?.[0]?.address?.chain || 'NA',
            type: tx.type || 'NA'
        };
    } catch (error) {
        console.error('Error fetching Arkham transaction details:', error.message);
        return {
            transactionIndex: "NA",
                blockhash: "NA",
                blockheight: "NA",
                blocktime: "NA",
                historicalusdprice: "NA",
                from: "NA",
                fromchain: "NA",
                to: "NA",
                tochain: "NA",
                type: "NA",
        };
    }
}

    connectWebsocket() {
        this.websocket = new WebSocket('wss://ws.blockchain.info/inv');
        this.websocket.on('open', () => {
            console.log('Websocket connection opened');
            this.websocket.send(JSON.stringify({op: 'unconfirmed_sub'}));
        });

        this.websocket.on('message', async (data) => {
            const tx = JSON.parse(data);
            console.log('New unconfirmed transaction:', tx);
        })
    }

    async generateDataset(seedAddresses, maxTransactions) {
// Start with seed addresses (known exchanges or interesting addresses)
const knownExchanges = new Set(seedAddresses.filter(addr => addr.isExchange));

// Process each seed address
for (const address of seedAddresses) {
    const transactions = await this.fetchAddressTransactions(address.address);
    let count = 0;
    // Process each transaction
    for (const tx of transactions.slice(1, 1000)) {
        count++;
        if (this.transactions.has(tx.txid)){
            continue;
        }

        // Fetch transaction details from Arkham API
        const arkhamTxDetails = await this.getArkhamTxDetails(tx.txid);

        const txDetails = await this.fetchTransactionDetails(tx.txid);
        if (!txDetails) continue;

        
        
        // Calculate metrics
        const metrics = this.calculateMetrics(txDetails);

        const combinedMetrics = {
            ...metrics,
            transactionIndex: arkhamTxDetails.transactionIndex,
            blockhash: arkhamTxDetails.blockhash,
            blockheight: arkhamTxDetails.blockheight,
            blocktime: arkhamTxDetails.blocktime,
            historicalusdprice: arkhamTxDetails.historicalusdprice,
            from: arkhamTxDetails.from,
            fromchain: arkhamTxDetails.fromchain,
            to: arkhamTxDetails.to,
            tochain: arkhamTxDetails.tochain,
            type: arkhamTxDetails.type
        };
        
        // Update exchange flag if any address is a known exchange
        combinedMetrics.is_exchange = txDetails.vout.some(output => 
            knownExchanges.has(output.scriptpubkey_address)
        );
        
        // Store transaction metrics
        this.transactions.set(tx.txid, combinedMetrics);
        
        // Store addresses
        txDetails.vin.forEach(input => {
            if (input.prevout?.scriptpubkey_address) {
                this.addresses.add(input.prevout.scriptpubkey_address);
            }
        });
        
        txDetails.vout.forEach(output => {
            if (output.scriptpubkey_address) {
                this.addresses.add(output.scriptpubkey_address);
            }
        });
        
        // Store relationships
        txDetails.vin.forEach(input => {
            if (input.prevout?.scriptpubkey_address) {
                this.relationships.push({
                    from: input.prevout.scriptpubkey_address,
                    to: tx.txid,
                    type: 'input',
                    value: input.prevout.value
                });
            }
        });
        
        txDetails.vout.forEach(output => {
            if (output.scriptpubkey_address) {
                this.relationships.push({
                    from: tx.txid,
                    to: output.scriptpubkey_address,
                    type: 'output',
                    value: output.value
                });
            }
        });
    }
    console.log(`Done processing transactions for address ${address.address}`);
}

// Label clusters based on transaction patterns
this.labelClusters();

// Save dataset
await this.saveDataset();
    }

    labelClusters() {
        // Simple clustering based on transaction patterns
        for (const [txid, metrics] of this.transactions.entries()) {
            // Example clustering logic:
            if (metrics.is_exchange) {
                metrics.cluster_label = 1; // Exchange-related
            } else if (metrics.total_btc > 10) {
                metrics.cluster_label = 2; // High-value
            } else if (metrics.indegree > 5 || metrics.outdegree > 5) {
                metrics.cluster_label = 3; // High-degree
            }
            // Add more sophisticated clustering logic as needed
        }
    }

    async saveDataset() {
        // Save transaction metrics to CSV
        await this.createCsvWriter.writeRecords(Array.from(this.transactions.values()));
        
        // Save relationships to JSON for graph creation
        await fs.writeFile(
            'relationships.json',
            JSON.stringify(Array.from(this.relationships), null, 2)
        );
        
        // Save address list
        await fs.writeFile(
            'addresses.json',
            JSON.stringify(Array.from(this.addresses), null, 2)
        );
    }
}

export default TransactionDatasetGenerator;