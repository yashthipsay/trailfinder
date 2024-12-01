import {EtherscanProvider} from "@ethersproject/providers";
import dotenv from 'dotenv'
import {getDriver} from '../db/neo4jdriver.js'
dotenv.config({
    path: '.env',
    debug: true,
    encoding: 'utf8',
})
import getEventsByTransactionHash from "./eventManager.js";
import axios from "axios";

const etherscanProvider = new EtherscanProvider("homestead", `${process.env.ETHERSCAN_API_KEY}`);
const recursionLimit = 2;
let driver = getDriver();
const CEX_API_URL = `https://api.arkhamintelligence.com/transfers`;

const WORMHOLE_CCTP_ADDRESS = "0xAaDA05BD399372f0b0463744C09113c137636f6a".toLowerCase();
const WORMHOLE_API_URL = "https://api.wormholescan.io/api/v1/transactions/";
const BRIDGE_TOKEN_ADDRESS = "0xCBCe172d7af2616804ab5b2494102dAeC47B2635".toLowerCase();
const WORMHOLE_TOKENBRIDGE_PORTAL = "0x3ee18B2214AFF97000D974cf647E7C347E8fa585".toLowerCase();

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

        const MAX_ITERATIONS = 10;  // Set the desired iteration limit
        let iterationCount = 0;    // Initialize a counter for iterations

        for (let tx of history) {
            if (iterationCount >= MAX_ITERATIONS) {
                console.log(`Reached maximum iteration count of ${MAX_ITERATIONS}. Stopping loop.`);
                break;  // Exit the loop once the maximum number of iterations is reached
            }
        
            iterationCount++;  // Increment the iteration counter
            const sender = tx.from.toLowerCase();
            const recipient = tx.to.toLowerCase();
            const value = tx.value.toString();
            const hash = tx.hash;
            const events = await getEventsByTransactionHash(hash) || [];

            // Fetch Arkham entity type for sender and recipient
            const senderEntityType = await getEntityType(sender);
            const recipientEntityType = await getEntityType(recipient);

            if (recipientEntityType === "cex") {
                console.log(`Detected CEX transaction: ${hash}`);
                const transfers = await getArkhamTransfers(sender, recipient);
                for (const transfer of transfers) {
                    await mapCexTransferToNeo4j(session, transfer);
                }
                continue;
            }
            
            // Check if the recipient is the Wormhole CCTP address
            if (recipient === WORMHOLE_CCTP_ADDRESS || recipient === WORMHOLE_TOKENBRIDGE_PORTAL) {
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

const mapCexTransferToNeo4j = async (session, transfer) => {
    const cexEntity = transfer.toAddress?.arkhamEntity;
    if (!cexEntity) {
        console.error("No CEX entity details found in transfer.");
        return;
    }

    try {
        // Add or update CEX entity
        await session.run(
            `
            MERGE (cex:CentralizedExchange {id: $id})
            SET cex.name = $name, 
                cex.website = $website, 
                cex.twitter = $twitter, 
                cex.crunchbase = $crunchbase, 
                cex.linkedin = $linkedin
            RETURN cex
            `,
            {
                id: cexEntity.id,
                name: cexEntity.name || "Unknown",
                website: cexEntity.website || "Unknown",
                twitter: cexEntity.twitter || "Unknown",
                crunchbase: cexEntity.crunchbase || "Unknown",
                linkedin: cexEntity.linkedin || "Unknown",
            }
        );

        // Add or update transaction and link to CEX
        await session.run(
            `
            MERGE (fromWallet:Wallet {address: $fromAddress, chainId: 'ethereum'})
            MERGE (toWallet:Wallet {address: $toAddress, chainId: 'ethereum'})
            MERGE (t:Transaction {id: $transactionHash})
            ON CREATE SET t.amount = $amount,
                          t.timestamp = datetime($timestamp),
                          t.tokenName = $tokenName,
                          t.tokenSymbol = $tokenSymbol,
                          t.chainId = 'ethereum'
            MERGE (fromWallet)-[:SENT_FROM]->(t)-[:SENT_TO]->(toWallet)
            MERGE (t)-[:INVOLVES]->(cex)
            `,
            {
                transactionHash: transfer.transactionHash,
                fromAddress: transfer.fromAddress?.address || "Unknown",
                toAddress: transfer.toAddress?.address || "Unknown",
                amount: transfer.unitValue || 0,
                timestamp: transfer.blockTimestamp || new Date().toISOString(),
                tokenName: transfer.tokenName || "Unknown",
                tokenSymbol: transfer.tokenSymbol || "Unknown",
            }
        );

        console.log(`Mapped transfer ${transfer.transactionHash} to CEX ${cexEntity.name}`);
    } catch (error) {
        console.error("Error mapping CEX transfer to Neo4j:", error.message);
    }
};

const getArkhamTransfers = async (fromAddress, toAddress) => {
    const apiKey = process.env.ARKHAM_API_KEY;
    try {
        const response = await axios.get(CEX_API_URL, {
            headers: { 'API-Key': apiKey },
            params: {
                base: "all",
                usdGte: 1000000,
                from: fromAddress,
                to: `all,type:cex,deposit:all`,
                chains: "ethereum",
            },
        });
        return response.data.transfers || [];
    } catch (error) {
        console.error("Error fetching Arkham transfers:", error.message);
        return [];
    }
};

const getEntityType = async (address) => {
    const apiKey = process.env.ARKHAM_API_KEY;
    try {
        const response = await axios.get(`https://api.arkhamintelligence.com/intelligence/address/${address}`, {
            headers: { 'API-Key': apiKey },
            params: { chain: 'ethereum' },
        });
        console.log(`Fetched entity type for address ${address}:`, response.data?.arkhamEntity?.type);
        return response.data?.arkhamEntity?.type || "unknown";
    } catch (error) {
        console.error(`Error fetching entity type for address ${address}:`, error.message);
        return "unknown";
    }
};

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
        const flattenedWormholeData = {
            emitterChain: wormholeData.emitterChain,
            emitterAddress: wormholeData.emitterAddress,
            emitterNativeAddress: wormholeData.emitterNativeAddress,
            tokenAmount: wormholeData.tokenAmount,
        };
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
                wormholeData: flattenedWormholeData,
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