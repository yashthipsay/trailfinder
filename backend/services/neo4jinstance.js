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

let neoSchema;
try{
neoSchema = new Neo4jGraphQL({ typeDefs, driver });
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