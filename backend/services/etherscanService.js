import {EtherscanProvider} from "@ethersproject/providers";
import dotenv from 'dotenv'
import {getDriver} from '../db/neo4jdriver.js'
dotenv.config({
    path: '.env',
    debug: true,
    encoding: 'utf8',
})
import getEventsByTransactionHash from "./eventManager.js";

const etherscanProvider = new EtherscanProvider("homestead", `${process.env.ETHERSCAN_API_KEY}`);
const recursionLimit = 2;
let driver = getDriver();

export const traceFundFlow = async (
    walletAddress,
    visitedAddresses = new Set(),
    depth
) => {
    if(depth >= recursionLimit) {
        console.log(`Recursion limit reached for ${walletAddress}`);
        return;
    }

    if (visitedAddresses.has(walletAddress)){
        console.log(`Already visted ${walletAddress}, skipping to avoid cycles.`);
        return;
    }

    visitedAddresses.add(walletAddress);
    const session = driver.session();
    
    try{
        console.log(`Tracing transactions for address: ${walletAddress}, depth: ${depth}`);

        const history = await etherscanProvider.getHistory(walletAddress);

        for (let tx of history) {
            const sender = tx.from;
            const recipient = tx.to;
            const value = tx.value.toString();
            const hash = tx.hash;
            const events = await getEventsByTransactionHash(hash) || [];
            await addTransaction(session, tx, events);

            console.log(events);
            console.log(`Transaction ${hash}: ${sender} -> ${recipient}, value: ${value}\n`);

            // Recursively trace sender and recipient, if they haven't been visited
            if (!visitedAddresses.has(sender)) {
                console.log(`Recursing into sender: ${sender}`);
                visitedAddresses.add(sender);
                await traceFundFlow(sender, visitedAddresses, depth + 1);
            }

            if (!visitedAddresses.has(recipient)) {
                console.log(`Recursing into recipient: ${recipient}`);
                visitedAddresses.add(recipient);
                await traceFundFlow(recipient, visitedAddresses, depth + 1);
            }
        }
    } catch (error) {
        console.error(`Error fetching transaction history for ${walletAddress}:`, error);
        session.close();
    } finally {
        await session.close();
    }
}

const storeTransaction = async(session, tx) => {

    await session.run(
        `MERGE (t: transaction {hash: $hash})
        SET t += {from: $from, to: $to, value: $value, timestamp: $timestamp}
        MERGE (a1:Address {address: $from})
        MERGE (a2:Address {address: $to})
        MERGE (a1)-[:SENT]->(t)
        MERGE (t)-[:RECEIVED_BY]->(a2)`,
        {
            
                hash: tx.hash,
                from: tx.from,
                to: tx.to,
                value: tx.value.toString(),
                timestamp: tx.timestamp
            
        }
        
    )

    
    
}


const addTransaction = async (session, tx, events) => {
    try {
      const result = await session.run(
        `
        MERGE (t:Transaction {id: randomUUID()})
        SET t.value = $value, t.timestamp = $timestamp
        MERGE (a1:Wallet {address: $from})
        MERGE (a2:Wallet {address: $to})
        MERGE (a1)-[:SENT_FROM]->(t)-[:SENT_TO]->(a2)
        WITH t
        MERGE (e:Event {id: randomUUID()})  // Create a single Event node
        SET e.log = $events  // Store the full events array as a single property
        MERGE (t)-[:TRIGGERED_IN]->(e)
        RETURN t, e
        `,
        {
          hash: tx.hash,
            from: tx.from,
            to: tx.to,
            value: tx.value.toString(),
            timestamp: tx.timestamp,
            events: events
        }
      );
  
    //   // Execute the event's function after creating the transaction
    //   for (const event of events) {
    //     await handleEventFunction(event.function); // Pass the function string to be executed
    //   }
  
      return result.records[0];
    } finally {
        
    }
  };