import { ApolloServer } from "@apollo/server";
import { startStandaloneServer } from "@apollo/server/standalone";
import { Neo4jGraphQL } from "@neo4j/graphql";
import neo4j from "neo4j-driver";

const typeDefs = `#graphql
type Wallet {
  address: String
  chainId: String
  transactions: [Transaction!]! @relationship(type: "SENT_FROM", direction: OUT)
}

type Transaction {
  id: String
  amount: Float
  timestamp: DateTime
  chainId: String
  tokenName: String
  tokenSymbol: String
  from: Wallet! @relationship(type: "SENT_FROM", direction: OUT)
  to: Wallet! @relationship(type: "SENT_TO", direction: IN)
  involves: [CentralizedExchange!]! @relationship(type: "INVOLVES", direction: OUT)
  suspiciousPatterns: [Pattern!]! @relationship(type: "PART_OF_PATTERN", direction: OUT)
  events: [Event!]! @relationship(type: "TRIGGERED_IN", direction: OUT)
  bridgedTo: Wallet @relationship(type: "BRIDGED_TO", direction: OUT)
}

type WormholeTransaction {
  id: String
  emitterChain: String!
  emitterAddress: String!
  emitterNativeAddress: String!
  tokenAmount: Float!
  transaction: Transaction! @relationship(type: "BRIDGED_TO", direction: IN)
}

type CentralizedExchange {
  id: String
  name: String!
  website: String
  twitter: String
  crunchbase: String
  linkedin: String
  transactions: [Transaction!]! @relationship(type: "INVOLVES", direction: IN)
}

type Pattern {
  name: String!
  description: String
  transactions: [Transaction!]! @relationship(type: "PART_OF_PATTERN", direction: IN)
}

type Event {
  id: String
  name: String
  details: String
  chainId: String
  transaction: Transaction @relationship(type: "TRIGGERED_IN", direction: IN)
}

type Query {
  wallets: [Wallet!]!
  transactions(filter: TransactionFilter): [Transaction!]!
  anomalousTransactions: [Transaction!]!
}

input TransactionFilter {
  minAmount: Float
  maxAmount: Float
  dateRange: DateRange
  suspicious: Boolean
}

input DateRange {
  from: DateTime
  to: DateTime
}

type Mutation {
  addWallet(address: String!, chainId: String!): Wallet!
  addTransaction(
    fromWallet: String, 
    toWallet: String, 
    amount: Float, 
    timestamp: DateTime, 
    chainId: String,
    events: [EventInput!]!
  ): Transaction!

  addCentralizedExchange(
    id: String!,
    name: String!,
    website: String,
    twitter: String,
    crunchbase: String,
    linkedin: String
  ): CentralizedExchange!
}

input EventInput {
  id: ID!
  name: String!
  details: String
  chainId: String!
}


`;

const URI = "neo4j+s://2bdd9fa8.databases.neo4j.io";
const USER = "neo4j";
const PASSWORD = "z69lmWz8lKxhthKw3sk7vv62pWjGgBp51z96Yg88apw";
export const initializeGraphqlServer = async () => {
  const driver = neo4j.driver(URI, neo4j.auth.basic(USER, PASSWORD));

  const resolvers = {
    Query: {
      wallets: async () => {
        const session = driver.session(); // Use existing driver
        try {
          const result = await session.run(`
          MATCH (w:Wallet)
          RETURN w
        `);

          const wallets = result.records.map(
            (record) => record.get("w").properties
          );

          // Return an array, even if it's empty
          return wallets.length ? wallets : [];
        } catch (error) {
          console.error("Error fetching wallets:", error);
          throw new Error("Failed to fetch wallets");
        } finally {
          await session.close(); // Close session after query
        }
      },
      transactions: async () => {
        const session = driver.session(); // Use existing driver
        try {
          const result = await session.run(`
          MATCH (t:Transaction)
          OPTIONAL MATCH (t)-[:TRIGGERED_IN]->(e:Event)
          RETURN t, collect(e) AS events
        `);

          return result.records.map((record) => {
            const transaction = record.get("t").properties;
            const events = record
              .get("events")
              .map((event) => event.properties);
            return {
              ...transaction,
              events: events.length ? events : [], // Return an array, even if it's empty
            };
          });
        } catch (error) {
          console.error("Error fetching transactions:", error);
          throw new Error("Failed to fetch transactions");
        } finally {
          await session.close(); // Close session after query
        }
      },
      anomalousTransactions: async () => {
        const session = driver.session();
        try {
          let result = await session.run(`
            MATCH (t:Transaction)
            WHERE t.anomalyScore = 1
            RETURN t
          `);

          const transactions = result.records.map((record) =>
            record.get("t".properties)
          );
          return transactions.length ? transactions : [];
        } catch (error) {
          console.error("Error fetching anomalous transactions:", error);
          throw new Error("Failed to fetch anomalous transactions");
        } finally {
          await session.close();
        }
      },
    },
    Mutation: {
      addWallet: async (_, { address, chainId }) => {
        const session = driver.session(); // Use existing driver
        try {
          const result = await session.run(
            `MERGE (w:Wallet {address: $address, chainId: $chainId})
           RETURN w`,
            { address, chainId }
          );

          const wallet = result.records[0]?.get("w").properties;

          if (!wallet) {
            throw new Error("Wallet creation failed.");
          }
          return wallet;
        } catch (error) {
          console.error("Error adding wallet:", error);
          throw new Error("Failed to add wallet");
        } finally {
          await session.close(); // Close session after mutation
        }
      },
      addTransaction: async (
        _,
        { fromWallet, toWallet, amount, timestamp, chainId }
      ) => {
        const session = driver.session(); // Use existing driver
        try {
          const result = await session.run(
            `MATCH (from:Wallet {address: $fromWallet})
           MATCH (to:Wallet {address: $toWallet})
           MERGE (t:Transaction {id: randomUUID(), amount: $amount, timestamp: $timestamp, chainId: $chainId})
           MERGE (from)-[:SENT_FROM]->(t)-[:SENT_TO]->(to)
           RETURN t`,
            { fromWallet, toWallet, amount, timestamp, chainId }
          );

          const transaction = result.records[0]?.get("t").properties;

          if (!transaction) {
            throw new Error("Transaction creation failed.");
          }
          return transaction;
        } catch (error) {
          console.error("Error adding transaction:", error);
          throw new Error("Failed to add transaction");
        } finally {
          await session.close(); // Close session after mutation
        }
      },
    },
    WormholeTransaction: {
      transaction: async (parent) => {
        const session = driver.session();
        try {
          const result = await session.run(
            `
          MATCH (t:Transaction)-[:BRIDGED_TO]->(w:WormholeTransaction {id: $id})
          RETURN t
          `,
            { id: parent.id }
          );

          const transaction = result.records[0]?.get("t").properties;

          if (!transaction) {
            throw new Error("Transaction not found for Wormhole.");
          }
          return transaction;
        } catch (error) {
          console.error("Error fetching Wormhole transaction:", error);
          throw new Error("Failed to fetch Wormhole transaction.");
        } finally {
          await session.close();
        }
      },
    },
  };

  let neoSchema;
  try {
    neoSchema = new Neo4jGraphQL({ typeDefs, driver, resolvers });
  } catch (err) {
    console.log(`Error: ${err.data}`);
    await driver.close();
    return;
  }
  const server = new ApolloServer({
    schema: await neoSchema.getSchema(),
  });

  const { url } = await startStandaloneServer(server, {
    context: async ({ req }) => ({ req }),
    listen: { port: 5000 },
  });

  console.log(`🚀 GraphQL Server ready at ${url}`);
};
