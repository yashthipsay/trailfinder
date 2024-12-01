import TransactionDatasetGenerator from "./generateDataset.js";
import { getDriver } from "../db/neo4jdriver.js";
import { cexEntities } from "./cexEntities.js";
import axios from "axios";

class mapBtcFlow extends TransactionDatasetGenerator {
    constructor() {
        super();
        this.driver = getDriver();
    }

    async getEntityTransfers(fromAddress, toAddress, minUsd = 1000000) {
       const baseUrl = "https://api.arkhamintelligence.com/transfers";

       const queryParams = {
        base: "all",
        usdGte: minUsd,
        to: `all,${toAddress},type:cex,deposit:bitcoin`,
        from: fromAddress,
        chains: "bitcoin",
       };

       try{
        // Make the request to Arkham API
        const response = await axios.get(baseUrl, {
            headers: { "API-Key": `${process.env.ARKHAM_API_KEY}` },
            params: queryParams,
        });

        return response.data;
       }catch(error) {
        console.error("Error fetching transfers:", error.message);
        throw error;
       }
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
        // If the entity type is cex, then make another get request to Arkham to get the transfers of the vin address on the cex address and map the transfers to Neo4j
        
        if (vin.prevout?.scriptpubkey_address) {

          const entityType = await this.getEntityType(vin.prevout.scriptpubkey_address, "bitcoin");

          if(entityType === "cex") {
            const transfers = await this.getEntityTransfers(
              vin.prevout.scriptpubkey_address,
              address
            );

            for(const transfer of transfers.transfers || []) {
              await this.mapCexTransferToNeo4j(transfer, vin.prevout.scriptpubkey_address);
            }
          } else {
            await this.mapFundFlow(
              vin.prevout.scriptpubkey_address,
              visitedAddresses,
              visitedTransactions,
              depth + 1,
              maxDepth
            );
            
          }
          
        }
      }

      for (const vout of txDetails.vout) {
        if (vout.scriptpubkey_address) {
          // Check if the entity type of the address is cex
          const entityType = await this.getEntityType(vout.scriptpubkey_address, "bitcoin");
      
          if (entityType === "cex") {
            // vout.scriptpubkey_address is a cex address
            const transfers = await this.getEntityTransfers(
              address, // current wallet as fromAddress
              vout.scriptpubkey_address // cex address as toAddress
            );
      
            // Map transfers to Neo4j
            for (const transfer of transfers.transfers || []) {
              await this.mapCexTransferToNeo4j(transfer, vout.scriptpubkey_address);
            }
          } else {
            // Continue recursive mapping if not a cex
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
    }

    async mapCexTransferToNeo4j(transfer, vinAddress) {
        const session = this.driver.session();

          try{
            const cexEntity = transfer.toAddress?.arkhamEntity;

            if(!cexEntity) return;

            await session.run(
              `
              MERGE (cex:CentralizedExchange{
              name: $name,
              website: $website,
              twitter: $twitter,
              crunchbase: $crunchbase,
              linkedin: $linkedin
              })
              RETURN cex
              `,
              {
                name: cexEntity.name,
                website: cexEntity.website || 'Does not exist',
                twitter: cexEntity.twitter || 'Does not exist',
                crunchbase: cexEntity.crunchbase || 'Does not exist',
                linkedin: cexEntity.linkedin || 'Does not exist',
              }
            );  

            await session.run(
              `
              MERGE (t:Transaction {hash: $txid})
            ON CREATE SET t.blockTimestamp = $blockTimestamp, t.unitValue = $unitValue, t.blockHash = $blockHash, t.blockHeight = $blockHeight
            WITH t
            MATCH (cex:CentralizedExchange {name: $name})
            MERGE (t)-[:INVOLVES]->(cex)
            MERGE (vin:Vin {address: $vinAddress})
            MERGE (vin)-[:SENT_TO]->(t)
            WITH t, cex
            OPTIONAL MATCH (t)-[r:OUTPUT]->(a:Vout {address: $cexAddress})
            DELETE r, a
              `,
              {
                txid: transfer.txid,
                blockTimestamp: transfer.blockTimestamp,
                unitValue: transfer.unitValue,
                blockHash: transfer.blockHash,
                blockHeight: transfer.blockHeight,
                name: cexEntity.name,
                vinAddress: vinAddress,
                cexAddress: transfer.toAddress.address,
              }
            );

            console.log(`Mapped transfer ${transfer.blockHash} to Neo4j`);
          } finally {
            await session.close();
          }
    }

      // Function to map a transaction to Neo4j
  async mapTransactionToNeo4j(transaction) {
    const session = this.driver.session();
    
    try {

      // Calculate metrics
      const metrics = this.calculateMetrics(transaction);

      // Add the transaction node
      await session.run(
        `
        MERGE (t:Transaction {hash: $txid})
        ON CREATE SET t.fee = $fee, t.confirmed = $confirmed, t.totalVinValue = $totalVinValue, t.totalVoutValue = $totalVoutValue
        RETURN t
        `,
        {
          txid: transaction.txid,
          fee: transaction.fee,
          confirmed: transaction.status.confirmed,
          totalVinValue: metrics.in_btc,
          totalVoutValue: metrics.out_btc,
        }
      );

      // Add the vin (input) relationships
      for (const vin of transaction.vin) {
        if (vin.prevout?.scriptpubkey_address) {
          await this.getEntityType(vin.prevout.scriptpubkey_address);
          await session.run(
            `
            MERGE (a:Vin {address: $address})
            MERGE (t:Transaction {hash: $txid})
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
        console.log("txids", transaction.txid);
        if (vout.scriptpubkey_address) {
          await session.run(
            `
            MERGE (t:Transaction {hash: $txid})
            MERGE (a:Vout {address: $address})
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