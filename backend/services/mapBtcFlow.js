import TransactionDatasetGenerator from "./generateDataset.js";
import { getDriver } from "../db/neo4jdriver.js";

class mapBtcFlow extends TransactionDatasetGenerator {
    constructor() {
        super();
        this.driver = getDriver();
    }


    async mapFundFlow(address, visitedAddresses, visitedTransactions, depth, maxDepth) {
        if(depth > maxDepth) {
            console.log(`Max depth ${maxDepth} reached for address ${address}`);
            return;
        }

        if(visitedAddresses.has(address)) {
            console.log(`Address ${address} already visited`);
            return;
        }

        visitedAddresses.add(address);

        console.log(`Fetching transactions for address ${address}`);
        const transactions = await this.fetchAddressTransactions(address);

        for (const tx of transactions) {
            if (visitedTransactions.has(tx.txid)) {
              continue;
            }
            visitedTransactions.add(tx.txid);

            const txDetails = await this.fetchTransactionDetails(tx.txid);
      if (!txDetails) {
        console.error(`Failed to fetch details for transaction ${tx.txid}`);
        continue;
      }

      console.log(`Mapping transaction ${tx.txid} in Neo4j`);
      await this.mapTransactionToNeo4j(txDetails);

      // Recursively trace vin.prevout addresses and vout addresses
      for (const vin of txDetails.vin) {
        if (vin.prevout?.scriptpubkey_address) {
          await this.mapFundFlow(
            vin.prevout.scriptpubkey_address,
            visitedAddresses,
            visitedTransactions,
            depth + 1,
            maxDepth
          );
        }
      }

      for (const vout of txDetails.vout) {
        if (vout.scriptpubkey_address) {
          await this.mapFundFlow(
            vout.scriptpubkey_address,
            visitedAddresses,
            visitedTransactions,
            depth + 1,
            maxDepth
          );
        }
    }
    
        }
    }

      // Function to map a transaction to Neo4j
  async mapTransactionToNeo4j(transaction) {
    const session = this.driver.session();
    try {
      // Add the transaction node
      await session.run(
        `
        MERGE (t:Transaction {txid: $txid})
        ON CREATE SET t.fee = $fee, t.confirmed = $confirmed
        RETURN t
        `,
        {
          txid: transaction.txid,
          fee: transaction.fee,
          confirmed: transaction.status.confirmed,
        }
      );

      // Add the vin (input) relationships
      for (const vin of transaction.vin) {
        if (vin.prevout?.scriptpubkey_address) {
          await session.run(
            `
            MERGE (a:Address {address: $address})
            MERGE (t:Transaction {txid: $txid})
            MERGE (a)-[:FUNDS {value: $value}]->(t)
            `,
            {
              address: vin.prevout.scriptpubkey_address,
              txid: transaction.txid,
              value: vin.prevout.value,
            }
          );
        }
      }

      // Add the vout (output) relationships
      for (const vout of transaction.vout) {
        if (vout.scriptpubkey_address) {
          await session.run(
            `
            MERGE (t:Transaction {txid: $txid})
            MERGE (a:Address {address: $address})
            MERGE (t)-[:OUTPUT {value: $value}]->(a)
            `,
            {
              txid: transaction.txid,
              address: vout.scriptpubkey_address,
              value: vout.value,
            }
          );
        }
      }
    } finally {
      await session.close();
    }
  }

    // Entry point for fund flow mapping
    async startMapping(address, maxDepth) {
        const visitedAddresses = new Set();
        const visitedTransactions = new Set();
    
        console.log(`Starting trace from address: ${address}`);
        await this.mapFundFlow(address, visitedAddresses, visitedTransactions, 0, maxDepth);
    
        console.log("Fund flow mapping completed.");
      }
}

export default mapBtcFlow;