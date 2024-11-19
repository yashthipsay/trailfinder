import axios from 'axios';
import fs from 'fs/promises';
import csv from 'csv-writer';
import Websocket from 'ws';



const BASE_URL = 'https://btcscan.org/api';

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
            console.log(response.data);
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

    async fetchAddressTransactions(address) {
        try {
            const data = await this.makeRateLimitedRequest(`${BASE_URL}/address/${address}/txs`);
            return data || [];
        } catch (error) {
            console.error(`Error fetching transactions for address ${address}:`, error.message);
            return [];
        }
    }

    async fetchTransactionDetails(txid) {
        try {
            return await this.makeRateLimitedRequest(`${BASE_URL}/tx/${txid}`);
        } catch (error) {
            console.error(`Error fetching transaction ${txid}:`, error.message);
            return null;
        }
    }

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
    
    // Process each transaction
    for (const tx of transactions.slice(0, maxTransactions)) {
        if (this.transactions.has(tx.txid)){
            continue;
        }
        const txDetails = await this.fetchTransactionDetails(tx.txid);
        if (!txDetails) continue;
        
        // Calculate metrics
        const metrics = this.calculateMetrics(txDetails);
        
        // Update exchange flag if any address is a known exchange
        metrics.is_exchange = txDetails.vout.some(output => 
            knownExchanges.has(output.scriptpubkey_address)
        );
        
        // Store transaction metrics
        this.transactions.set(tx.txid, metrics);
        
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