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

const WORMHOLE_CCTP_ADDRESS = "0xAaDA05BD399372f0b0463744C09113c137636f6a".toLowerCase();
const WORMHOLE_API_URL = "https://api.wormholescan.io/api/v1/transactions/";
const BRIDGE_TOKEN_ADDRESS = "0xCBCe172d7af2616804ab5b2494102dAeC47B2635".toLowerCase();

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

    const session = driver.session();
    
    try{
        console.log(`Tracing transactions for address: ${walletAddress}, depth: ${depth}`);

        const history = await etherscanProvider.getHistory(walletAddress);

        for (let tx of history) {
            const sender = tx.from.toLowerCase();
            const recipient = tx.to.toLowerCase();
            const value = tx.value.toString();
            const hash = tx.hash;
            const events = await getEventsByTransactionHash(hash) || [];
            
            // Check if the recipient is the Wormhole CCTP address
            if (recipient === WORMHOLE_CCTP_ADDRESS) {
                console.log(`Detected transfer to Wormhole CCTP: ${hash}`);
                const wormholeData = await fetchWormholeTransaction(sender);
                if (wormholeData) {
                    await addWormholeTransaction(session, tx, wormholeData, events);
                }
            } else if (sender === BRIDGE_TOKEN_ADDRESS || recipient === BRIDGE_TOKEN_ADDRESS) {
                console.log(`Detected BRIDGE token transaction: ${hash}`);
                await addBridgeTransaction(session, tx, events);
            } else {
                await addTransaction(session, tx);
            }

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


const fetchWormholeTransaction = async (address) => {
    try {
        const response = await fetch(`${WORMHOLE_API_URL}?pageSize=1&sortOrder=DESC&address=${address}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        return data.transactions[0];
    } catch (error) {
        console.error("Error fetching Wormhole transaction:", error);
        return null;
    }
}

const addWormholeTransaction = async (session, tx, wormholeData, events) => {
    console.log("Wormhole data:", wormholeData);
    try {
        const result = await session.run(
            `
            MERGE (t:Transaction {hash: $hash})
            SET t.value = $value, t.timestamp = $timestamp, t.from = $from, t.to = $to 
            MERGE (a1:Wallet {address: $from})
            MERGE (a2:Wallet {address: $to})
            MERGE (a1)-[:SENT_FROM]->(t)-[:SENT_TO]->(a2)
            
            MERGE (w:WormholeTransaction {id: $wormholeId})
            SET w += $wormholeData
            MERGE (t)-[:TRIGGERED]->(w)
            
            MERGE (e:Event {id: randomUUID()})
            SET e.log = $events
            MERGE (t)-[:TRIGGERED_IN]->(e)
            
            RETURN t, w, e
            `,
            {
                hash: tx.hash,
                from: tx.from,
                to: tx.to,
                value: tx.value.toString(),
                timestamp: tx.timestamp,
                events: events,
                wormholeId: wormholeData.id.toString(),
                wormholeData: wormholeData,
            }
        );
        console.log("Wormhole transaction added:", result.records[0]);
        
        return result.records[0];
    } catch (error) {
        console.error("Error adding Wormhole transaction:", error);
    }
}



const addBridgeTransaction = async (session, tx, events) => {
    try {
        const result = await session.run(
            `
            MERGE (t:Transaction {hash: $hash})
            SET t.value = $value, t.timestamp = $timestamp, t.from = $from, t.to = $to 
            MERGE (a1:Wallet {address: $from})
            MERGE (a2:Wallet {address: $to})
            MERGE (a1)-[:SENT_FROM]->(t)-[:SENT_TO]->(a2)
            
            MERGE (e:Event {id: randomUUID()})
            SET e.log = $events
            MERGE (t)-[:TRIGGERED_IN]->(e)
            
            RETURN t, e
            `,
            {
                hash: tx.hash,
                from: tx.from,
                to: tx.to,
                value: tx.value.toString(),
                timestamp: tx.timestamp,
                events: [] ? "Tokens Deposited" : events
            }
        );
        console.log("BRIDGE transaction added:", result.records[0]);
        return result.records[0];
    } catch (error) {
        console.error("Error adding BRIDGE transaction:", error);
    }
}

const addTransaction = async (session, tx) => {
    try {
        const result = await session.run(
            `
            MERGE (t:Transaction {hash: $hash})
            SET t.value = $value, t.timestamp = $timestamp, t.from = $from, t.to = $to 
            MERGE (a1:Wallet {address: $from})
            MERGE (a2:Wallet {address: $to})
            MERGE (a1)-[:SENT_FROM]->(t)-[:SENT_TO]->(a2)
            
            RETURN t
            `,
            {
                hash: tx.hash,
                from: tx.from,
                to: tx.to,
                value: tx.value.toString(),
                timestamp: tx.timestamp
            }
        );
        console.log("Transaction added:", result.records[0]);
        return result.records[0];
    } catch (error) {
        console.error("Error adding transaction:", error);
    }
};