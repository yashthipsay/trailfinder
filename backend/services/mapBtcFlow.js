import TransactionDatasetGenerator from "./generateDataset.js";
import { getDriver } from "../db/neo4jdriver.js";
import { cexEntities } from "./cexEntities.js";
import axios from "axios";
import fs from "fs/promises";
import { session } from "neo4j-driver";
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

          await this.createSameAsRelationship(vin.prevout.scriptpubkey_address);

          
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
          await this.createSameAsRelationship(vout.scriptpubkey_address);

        }
      }
      await this.createAllSameAsRelationships();
     
    }
    }

    async createSameAsRelationship(address) {
      const session = this.driver.session();
      try{
        await session.run(
          `
          MATCH (vout:Vout {address: $address})
          MATCH (vin:Vin {address: $address})
          MERGE (vout)-[:SAME_AS]->(vin)
          `,
          { address }
      );
      console.log(`Created SAME_AS relationship for address ${address}`);
      } catch (error) {
        console.error(`Error creating SAME_AS relationship for address ${address}:`, error);
      }
    }

    // New method to create all SAME_AS relationships
    async createAllSameAsRelationships() {
      const session = this.driver.session();
      try{
        await session.run(
          `
          MATCH (vin:Vin), (vout:Vout)
          WHERE vin.address = vout.address
          AND NOT (vout)-[:SAME_AS]->(vin)
          MERGE (vout)-[:SAME_AS]->(vin)
          `
        );
        console.log("Created SAME_AS relationships for all matching Vin and Vout nodes.");
      } catch(error){
        console.error("Error creating SAME_AS relationships for all matching Vin and Vout nodes:", error);
        throw error;
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
            MERGE (vin)-[:SENT_TO {value: $unitValue}]->(t)
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


      /*******************************************************MIXERS DATASET********************************/
//       async fetchPrecursorTransactions(txid, maxDepth) {
//         const session = this.driver.session();
//         try {
//           const result = await session.run(
//             `
//             MATCH (t:Transaction {hash: $txid})
//             CALL apoc.path.subgraphNodes(t, {
//                 relationshipFilter: '<FUNDS|<SENT_TO|<SAME_AS|<OUTPUT',
//                 maxLevel: $maxDepth,
//                 bfs: true
//             }) YIELD node
//             WITH node
//             WHERE node:Transaction AND node.hash <> $txid
//             RETURN DISTINCT node AS precursor
//             `,
//             { txid, maxDepth }
//         );
    
//             return result.records.map(record => record.get('precursor').properties);
//         } catch (error) {
//             console.error(`Error fetching precursor transactions for ${txid}:`, error.message);
//             throw error;
//         } finally {
//             await session.close();
//         }
//     }

//   async writePrecursorTransactionsToFile(txid, filePath, maxDepth = 30) {
//     try {
//         const precursorTransactions = await this.fetchPrecursorTransactions(txid, maxDepth);
//         const jsonData = JSON.stringify(precursorTransactions, null, 2);
//         await fs.writeFile(filePath, jsonData, 'utf-8');
//         console.log(`Precursor transactions successfully written to ${filePath}`);
//     } catch (error) {
//         console.error(`Error writing precursor transactions to ${filePath}:`, error);
//         throw error;
//     }
// }

// async fetchPrecursorTransactionMetrics(txid, maxDepth) {
//   const session = this.driver.session();
//   try {
//     const metrics = []; // Initialize a 2D array

//     for (let level = 1; level <= maxDepth; level++) {
//       const result = await session.run(
//         `
//         MATCH (t:Transaction {hash: $txid})
//         CALL apoc.path.expandConfig(t, {
//           relationshipFilter: '<FUNDS|<SAME_AS|<OUTPUT',
//           minLevel: $level,
//           maxLevel: $level,
//           bfs: true
//         }) YIELD path
//         WITH nodes(path)[-1] AS precursor
//         WHERE precursor:Transaction
//         RETURN
//           SUM(precursor.unitValue) AS totalUnitValue,
//           COUNT(precursor) AS txCount,
//           SUM(precursor.totalVinValue) AS totalVinValue,
//           SUM(precursor.totalVoutValue) AS totalVoutValue,
//           AVG(precursor.totalVinValue) AS meanInBtc,
//           AVG(precursor.totalVoutValue) AS meanOutBtc
//         `,
//         { txid, level }
//       );

//       let totalUnitValue = 0;
//       let txCount = 0;
//       let totalVinValue = 0;
//       let totalVoutValue = 0;
//       let meanInBtc = 0;
//       let meanOutBtc = 0;

//       if (result.records.length > 0) {
//         const record = result.records[0];
//         totalUnitValue = record.get('totalUnitValue') ? record.get('totalUnitValue').toString() : 0;
//         txCount = record.get('txCount') ? record.get('txCount').toString() : 0;
//         totalVinValue = record.get('totalVinValue') ? record.get('totalVinValue').toString() : 0;
//         totalVoutValue = record.get('totalVoutValue') ? record.get('totalVoutValue').toString() : 0;
//         meanInBtc = record.get('meanInBtc') ? record.get('meanInBtc').toString() : 0;
//         meanOutBtc = record.get('meanOutBtc') ? record.get('meanOutBtc').toString() : 0;

//         metrics.push({
//         level,
//         totalUnitValue,
//         txCount,
//         totalVinValue,
//         totalVoutValue,
//         meanInBtc,
//         meanOutBtc
//         });
//       } else {
//         metrics.push({
//           level,
//           totalUnitValue: 0,
//           txCount: 0,
//           totalVinValue: 0,
//           totalVoutValue: 0,
//           meanInBtc: 0,
//           meanOutBtc: 0,
//         });
//       }
//     }

//     return metrics;
//   } catch (error) {
//     console.error(`Error fetching precursor transaction metrics for ${txid}:`, error.message);
//     throw error;
//   } finally {
//     await session.close();
//   }
// }



// async writePrecursorTransactionMetricsToFile(txid, filePath, maxDepth = 30) {
//   try {
//       const precursorTransactionMetrics = await this.fetchPrecursorTransactionMetrics(txid, maxDepth);
//       const jsonData = JSON.stringify(precursorTransactionMetrics, null, 2);
//       await fs.writeFile(filePath, jsonData, 'utf-8');
//       console.log(`Precursor transaction metrics successfully written to ${filePath}`);
//   } catch (error) {
//       console.error(`Error writing precursor transaction metrics to ${filePath}:`, error);
//       throw error;
//   }
// }




async fetchPrecursorLayers(txid, maxDepth) {
  const session = this.driver.session();
  try {
    let currentLayer = [txid]; // Start with the initial transaction
    const layers = []; // To store all transactions and their precursors
    const visitedTransactions = new Set(); // Track visited transactions to avoid redundancy

    for (let depth = 1; depth <= maxDepth; depth++) {
      if (currentLayer.length === 0) break; // Stop if there are no more transactions to process

      const result = await session.run(
        `
        UNWIND $currentLayer AS currentTx
        MATCH (t:Transaction {hash: currentTx})<-[:FUNDS]-(v:Vin)<-[:SAME_AS]-(o:Vout)<-[:OUTPUT]-(precursor:Transaction)
        WHERE NOT precursor.hash IN $visited
        RETURN DISTINCT t.hash AS transaction, collect(DISTINCT precursor.hash) AS precursors
        `,
        { currentLayer, visited: Array.from(visitedTransactions) }
      );

      const layerData = result.records.map(record => {
        const transaction = record.get("transaction");
        const precursors = record.get("precursors");

        // Add the transaction and its precursors to the visited set
        visitedTransactions.add(transaction);
        precursors.forEach(hash => visitedTransactions.add(hash));

        return { transaction: [transaction], precursors };
      });

      layers.push(...layerData);

      // Update currentLayer for the next iteration
      currentLayer = result.records.flatMap(record => record.get("precursors"));
    }

    console.log(`Precursor layers for transaction ${txid}:`, layers);
    return layers;
  } catch (error) {
    console.error(`Error fetching precursor layers for transaction ${txid}:`, error.message);
    throw error;
  }



}


async writePrecursorLayersToFile(txid, filePath, maxDepth = 5) {
  try {
      const layers = await this.fetchPrecursorLayers(txid, maxDepth);
      const jsonData = JSON.stringify(layers, null, 2);
      await fs.writeFile(filePath, jsonData, 'utf-8');
      console.log(`Precursor layers successfully written to ${filePath}`);
  } catch (error) {
      console.error(`Error writing precursor layers to ${filePath}:`, error);
      throw error;
  }
}

async fetchSuccessorLayers(txid, maxDepth) {
  const session = this.driver.session();
  try {
    let currentLayer = [txid]; // Start with the target transaction
    const layers = []; // To store all transactions and their successors
    const visitedTransactions = new Set(); // Track visited transactions to avoid redundancy

    for (let depth = 1; depth <= maxDepth; depth++) {
      if (currentLayer.length === 0) break; // Stop if there are no more transactions to process

      // Run query for each layer to get the successors
      const result = await session.run(
        `
        UNWIND $currentLayer AS currentTx
        MATCH (t:Transaction {hash: currentTx})-[:OUTPUT]->(v:Vout)-[:SAME_AS]->(o:Vin)-[:FUNDS]->(successor:Transaction)
        WHERE NOT successor.hash IN $visited
        RETURN DISTINCT t.hash AS transaction, collect(DISTINCT successor.hash) AS successors
        `,
        { currentLayer, visited: Array.from(visitedTransactions) }
      );

      // Process the query results
      const layerData = result.records.map(record => {
        const transaction = record.get("transaction");
        const successors = record.get("successors");

        // Add the transaction and its successors to the visited set
        visitedTransactions.add(transaction[0]); // The current transaction
        successors.forEach(hash => visitedTransactions.add(hash)); // Add all successors to visited

        return { transaction, successors };
      });

      // Add the layer data to the final result
      layers.push(...layerData);

      // Update the currentLayer with the new successors for the next iteration
      currentLayer = result.records.flatMap(record => record.get("successors"));
    }

    console.log(`Successor layers for transaction ${txid}:`, layers);
    return layers;
  } catch (error) {
    console.error(`Error fetching successor layers for transaction ${txid}:`, error.message);
    throw error;
  }

  
}

  // Write Successor Layers to File
  async writeSuccessorLayersToFile(txid, filePath, maxDepth = 5) {
    try {
      // Fetch successor layers
      const layers = await this.fetchSuccessorLayers(txid, maxDepth);

      // Format the data as JSON
      const jsonData = JSON.stringify(layers, null, 2);

      // Write the JSON data to the specified file
      await fs.writeFile(filePath, jsonData, 'utf-8');

      console.log(`Successor layers successfully written to ${filePath}`);
    } catch (error) {
      console.error(`Error writing successor layers to ${filePath}:`, error.message);
      throw error;
    }
  }





  // async fetchSuccessorTransactionMetrics(txid, maxDepth) {
  //   const session = this.driver.session();
  //   try {
  //     const metrics = [];
  
  //     for (let level = 1; level <= maxDepth; level++) {
  //       const result = await session.run(
  //         `
  //         MATCH (t:Transaction {hash: $txid})
  //         CALL apoc.path.expandConfig(t, {
  //           relationshipFilter: '>OUTPUT|>SAME_AS|>FUNDS',
  //           minLevel: $level,
  //           maxLevel: $level,
  //           bfs: true
  //         }) YIELD path
  //         WITH nodes(path)[-1] AS successor
  //         WHERE successor:Transaction
  //         RETURN
  //           SUM(successor.unitValue) AS totalUnitValue,
  //           COUNT(successor) AS txCount,
  //           SUM(successor.totalVinValue) AS totalVinValue,
  //           SUM(successor.totalVoutValue) AS totalVoutValue,
  //           AVG(successor.totalVinValue) AS meanInBtc,
  //           AVG(successor.totalVoutValue) AS meanOutBtc
  //         `,
  //         { txid, level }
  //       );
  
  //       let totalUnitValue = 0;
  //       let txCount = 0;
  //       let totalVinValue = 0;
  //       let totalVoutValue = 0;
  //       let meanInBtc = 0;
  //       let meanOutBtc = 0;
  
  //       if (result.records.length > 0) {
  //         const record = result.records[0];
  //         totalUnitValue = record.get('totalUnitValue') ? record.get('totalUnitValue').toString() : 0;
  //         txCount = record.get('txCount') ? record.get('txCount').toString() : 0;
  //         totalVinValue = record.get('totalVinValue') ? record.get('totalVinValue').toString() : 0;
  //         totalVoutValue = record.get('totalVoutValue') ? record.get('totalVoutValue').toString() : 0;
  //         meanInBtc = record.get('meanInBtc') ? record.get('meanInBtc').toString() : 0;
  //         meanOutBtc = record.get('meanOutBtc') ? record.get('meanOutBtc').toString() : 0;
  //       }
  
  //       metrics.push({
  //         level,
  //         totalUnitValue,
  //         txCount,
  //         totalVinValue,
  //         totalVoutValue,
  //         meanInBtc,
  //         meanOutBtc,
  //       });
  //     }
  
  //     return metrics;
  //   } catch (error) {
  //     console.error(`Error fetching successor transaction metrics for ${txid}:`, error.message);
  //     throw error;
  //   } finally {
  //     await session.close();
  //   }
  // }
  
  // async writeSuccessorTransactionMetricsToFile(txid, filePath, maxDepth = 30) {
  //   try {
  //       const successorTransactionMetrics = await this.fetchSuccessorTransactionMetrics(txid, maxDepth);
  //       const jsonData = JSON.stringify(successorTransactionMetrics, null, 2);
  //       await fs.writeFile(filePath, jsonData, 'utf-8');
  //       console.log(`Successor transaction metrics successfully written to ${filePath}`);
  //   } catch (error) {
  //       console.error(`Error writing successor transaction metrics to ${filePath}:`, error);
  //       throw error;
  //   }
  // }



// async fetchSuccessorTransactions(txid, maxDepth) {
//   const session = this.driver.session();
//   try{ 
//     const result = await session.run(
//       `
//       MATCH (t:Transaction {hash: $txid})
//       CALL apoc.path.subgraphNodes(t, {
//           relationshipFilter: '>OUTPUT|>SAME_AS|>FUNDS|',
//           maxLevel: $maxDepth,
//           bfs: true
//       }) YIELD node
//        WITH node
//        WHERE node: Transaction AND node.hash <> $txid
//        RETURN DISTINCT node AS successor
//       `,
//       { txid, maxDepth }
//     );
//     console.log("result", result.records);
//     return result.records.map(record => record.get('successor').properties);
//   } catch (error) {
//     console.error(`Error fetching successor transactions for ${txid}:`, error.message);
//     throw error;
//   }
// }

// async writeSuccessorTransactionsToFile(txid, filePath, maxDepth = 10) {
//   try{
//     const successorTransactions = await this.fetchSuccessorTransactions(txid, maxDepth);
//     const jsonData = JSON.stringify(successorTransactions, null, 2);
//     await fs.writeFile(filePath, jsonData, 'utf-8');
//     console.log(`Successor transactions successfully written to ${filePath}`);
//   } catch (error) {
//     console.error(`Error writing successor transactions to ${filePath}:`, error);
//     throw error;
//   }
// }
}


export default mapBtcFlow;