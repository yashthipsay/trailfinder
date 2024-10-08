import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { Neo4jGraphQL } from "@neo4j/graphql";
import neo4j from "neo4j-driver";



const typeDefs = `#graphql
type Wallet {
  address: ID! @id
  chainId: String!
  transactions: [Transaction!]! @relationship(type: "SENT_FROM", direction: OUT)
}

type Transaction {
  id: ID! @id
  amount: Float!
  timestamp: DateTime!
  chainId: String!
  from: Wallet! @relationship(type: "SENT_FROM", direction: OUT)
  to: Wallet! @relationship(type: "SENT_TO", direction: IN)
  suspiciousPatterns: [Pattern!]! @relationship(type: "PART_OF_PATTERN", direction: OUT)
  events: [Event!]! @relationship(type: "TRIGGERED_IN", direction: OUT)
  bridgedTo: Wallet @relationship(type: "BRIDGED_TO", direction: OUT)
}

type Pattern {
  name: String!
  description: String
  transactions: [Transaction!]! @relationship(type: "PART_OF_PATTERN", direction: IN)
}

type Event {
  id: ID! @id
  name: String!
  details: String
  chainId: String!
  transaction: Transaction! @relationship(type: "TRIGGERED_IN", direction: IN)
}

type Query {
  wallets: [Wallet!]!
  transactions(filter: TransactionFilter): [Transaction!]!
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
    fromWallet: ID!, 
    toWallet: ID!, 
    amount: Float!, 
    timestamp: DateTime!, 
    chainId: String!,
    events: [EventInput!]!
  ): Transaction!
}

input EventInput {
  id: ID!
  name: String!
  details: String
  chainId: String!
}
`;


const URI = process.env.NEO4J_URI
    const USER = process.env.NEO4J_USERNAME
    const PASSWORD = process.env.NEO4J_PASSWORD
export const initializeGraphqlServer = async () => {

const driver = neo4j.driver(URI, neo4j.auth.basic(USER, PASSWORD));

const resolvers = {
  Query: {
    wallets: async () => {
      const session = driver.session();  // Use existing driver
      try {
        const result = await session.run(`
          MATCH (w:Wallet)
          RETURN w
        `);

        const wallets = result.records.map(record => record.get('w').properties);

        // Return an array, even if it's empty
        return wallets.length ? wallets : [];
      } catch (error) {
        console.error('Error fetching wallets:', error);
        throw new Error('Failed to fetch wallets');
      } finally {
        await session.close(); // Close session after query
      }
    },
    transactions: async () => {
      const session = driver.session();  // Use existing driver
      try {
        const result = await session.run(`
          MATCH (t:Transaction)
          RETURN t
        `);

        const transactions = result.records.map(record => record.get('t').properties);

        // Return an array, even if it's empty
        return transactions.length ? transactions : [];
      } catch (error) {
        console.error('Error fetching transactions:', error);
        throw new Error('Failed to fetch transactions');
      } finally {
        await session.close();  // Close session after query
      }
    }
  },
  Mutation: {
    addWallet: async (_, { address, chainId }) => {
      const session = driver.session();  // Use existing driver
      try {
        const result = await session.run(
          `MERGE (w:Wallet {address: $address, chainId: $chainId})
           RETURN w`,
          { address, chainId }
        );

        const wallet = result.records[0]?.get('w').properties;

        if (!wallet) {
          throw new Error('Wallet creation failed.');
        }
        return wallet;
      } catch (error) {
        console.error('Error adding wallet:', error);
        throw new Error('Failed to add wallet');
      } finally {
        await session.close(); // Close session after mutation
      }
    },
    addTransaction: async (_, { fromWallet, toWallet, amount, timestamp, chainId }) => {
      const session = driver.session();  // Use existing driver
      try {
        const result = await session.run(
          `MATCH (from:Wallet {address: $fromWallet})
           MATCH (to:Wallet {address: $toWallet})
           MERGE (t:Transaction {id: randomUUID(), amount: $amount, timestamp: $timestamp, chainId: $chainId})
           MERGE (from)-[:SENT_FROM]->(t)-[:SENT_TO]->(to)
           RETURN t`,
          { fromWallet, toWallet, amount, timestamp, chainId }
        );

        const transaction = result.records[0]?.get('t').properties;

        if (!transaction) {
          throw new Error('Transaction creation failed.');
        }
        return transaction;
      } catch (error) {
        console.error('Error adding transaction:', error);
        throw new Error('Failed to add transaction');
      } finally {
        await session.close(); // Close session after mutation
      }
    }
  }
};


let neoSchema;
try{
neoSchema = new Neo4jGraphQL({ typeDefs, driver, resolvers });
} catch(err) {
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