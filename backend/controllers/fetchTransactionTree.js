import { getDriver } from "../db/neo4jdriver";
import fs from "fs/promises";

const driver = getDriver();

const fetchTransactionTree = async(txid) => {
    const session = driver.session();
    try{
        // Fetch precursor transactions
        const precursorResult = await session.run(
            `
            MATCH (target:Transaction {txid: $txid})-[:INPUTS*1..30]->(precursor:Transaction)
            RETURN target.txid AS TargetTx, collect(precursor.txid) AS PrecursorTxs
            `,
            { txid }
        );

        const precursorTxs = precursorResult.records[0]?.get('PrecursorTxs') || [];

         // Fetch successor transactions
         const successorResult = await session.run(
             `
             MATCH (target:Transaction {txid: $txid})<-[:INPUTS*1..10]-(successor:Transaction)
             RETURN target.txid AS TargetTx, collect(successor.txid) AS SuccessorTxs
             `,
             { txid }
         );

            const successorTxs = successorResult.records[0]?.get('SuccessorTxs') || [];

            return {
                txid,
                precursorTxs,
                successorTxs
            };
    } catch (error) {
        console.error('Error fetching transaction tree:', error);
        throw error;
    }
}

const storeTransactionTreeData = async (data, filePath) => {
    try{
        const jsonData = JSON.stringify(data, null, 2);
        await fs.writeFile(filePath, jsonData, 'utf-8');
        console.log(`Data successfully written to ${filePath}`);
    } catch (error) {
        console.error(`Error writing data to ${filePath}:`, error);
        throw error;
    }
}



export { fetchTransactionTree, storeTransactionTreeData };