import { ApolloServer } from "@apollo/server";
import { startStandaloneServer } from "@apollo/server/standalone";
import { Neo4jGraphQL } from "@neo4j/graphql";
import neo4j from "neo4j-driver";

const typeDefs = `#graphql
type Transaction {
  hash: String
  vin: [Vin]
  vout: [Vout]
  totalVinValue: Int!
  totalVoutValue: Int!
  fee: Int
  confirmed: Boolean
  blockHeight: Int
  involvedCex: CentralizedExchange @relationship(type: "INVOLVES", direction: OUT)
  anomaly: Boolean
}

type Vin {
  txid: String
  voutIndex: Int
  value: Int
  address: String
}

type Vout {
  value: Int
  address: String
}

type CentralizedExchange {
  name: String!
  website: String
  twitter: String
  crunchbase: String
  linkedin: String
}

type Query {
  transaction(hash: String): Transaction
  transactions: [Transaction]
}

type Mutation {
  mapCexTransaction(fromAddress: String!, toAddress: String!): CentralizedExchange!
}
`;


const URI = process.env.NEO4J_URI;
const USER = process.env.NEO4J_USERNAME;
const PASSWORD = process.env.NEO4J_PASSWORD;

export const initializeBtcNeo4jServer = async () => {
  const driver = neo4j.driver(URI, neo4j.auth.basic(USER, PASSWORD));

  const resolvers = {
    Transaction: {
      // Computed field for total value of all vin values
      totalVinValue: async (parent, args, context) => {
        const session = driver.session();
        try {
          const result = await session.run(
            `
              MATCH (t:Transaction {hash: $hash})-[:FUNDS]->(vin:Vin)
              RETURN sum(vin.value) AS totalVinValue
            `,
            { hash: parent.hash }
          );
          return result.records[0]?.get("totalVinValue") || 0;
        } finally {
          await session.close();
        }
      },
  
      // Computed field for total value of all vout values
      totalVoutValue: async (parent, args, context) => {
        const session = driver.session();
        try {
          const result = await session.run(
            `
              MATCH (t:Transaction {hash: $hash})-[:OUTPUT]->(vout:Vout)
              RETURN sum(vout.value) AS totalVoutValue
            `,
            { hash: parent.hash }
          );
          return result.records[0]?.get("totalVoutValue") || 0;
        } finally {
          await session.close();
        }
      },
  
      involvedCex: async (parent, args, context) => {
        const session = driver.session();
        try {
          const result = await session.run(
            `
              MATCH (t:Transaction {hash: $hash})-[:INVOLVES]->(cex:CentralizedExchange)
              RETURN cex
            `,
            { hash: parent.hash }
          );
          return result.records.map((record) => record.get("cex").properties);
        } finally {
          await session.close();
        }
      },
    },
  
    Query: {
      // Resolver for a single transaction
      transaction: async (_, { hash }, context) => {
        const session = driver.session();
        try {
          const result = await session.run(
            `
              MATCH (t:Transaction {hash: $hash})
              OPTIONAL MATCH (vin:Vin)-[:FUNDS]->(t)
              OPTIONAL MATCH (t)-[:OUTPUT]->(vout:Vout)
              RETURN t, collect(vin) AS vins, collect(vout) AS vouts
            `,
            { hash }
          );
  
          if (result.records.length === 0) return null;
  
          const record = result.records[0];
          const transaction = record.get("t").properties;
          const vins = record.get("vins").map((vin) => vin.properties);
          const vouts = record.get("vouts").map((vout) => vout.properties);
  
          return {
            ...transaction,
            vin: vins,
            vout: vouts,
          };
        } finally {
          await session.close();
        }
      },
  
      // Resolver for all transactions
      transactions: async (_, __, context) => {
        const session = driver.session();
        try {
          const result = await session.run(
            `
              MATCH (t:Transaction)
              OPTIONAL MATCH (vin:Vin)-[:FUNDS]->(t)
              OPTIONAL MATCH (t)-[:OUTPUT]->(vout:Vout)
              RETURN t, collect(vin) AS vins, collect(vout) AS vouts
            `
          );
  
          return result.records.map((record) => {
            const transaction = record.get("t").properties;
            const vins = record.get("vins").map((vin) => vin.properties);
            const vouts = record.get("vouts").map((vout) => vout.properties);
  
            return {
              ...transaction,
              vin: vins,
              vout: vouts,
            };
          });
        } finally {
          await session.close();
        }
      },
    },
  
    Mutation: {
      async mapCexTransaction(_, { fromAddress, toAddress }, context) {
        const session = driver.session();
  
        try {
          const data = await getEntityTransfers(fromAddress, toAddress);
  
          if (!data || !data.transfers || data.transfers.length === 0) {
            throw new Error(`No transactions found between ${fromAddress} and ${toAddress}`);
          }
  
          const transfer = data.transfers.find(
            (t) =>
              t.toAddress &&
              t.toAddress.arkhamEntity &&
              t.toAddress.arkhamEntity.type === "cex"
          );
  
          if (!transfer) {
            throw new Error(`No transactions involving a centralized exchange found.`);
          }
  
          const cexEntity = transfer.toAddress.arkhamEntity;
  
          const query = `
            MATCH (t:Transaction {hash: $hash})
            MERGE (cex:CentralizedExchange {
              name: $name,
              website: $website,
              twitter: $twitter,
              crunchbase: $crunchbase,
              linkedin: $linkedin
            })
            MERGE (t)-[:INVOLVES]->(cex)
            RETURN cex
          `;
  
          const params = {
            hash: transfer.txid,
            name: cexEntity.name,
            website: cexEntity.website || null,
            twitter: cexEntity.twitter || null,
            crunchbase: cexEntity.crunchbase || null,
            linkedin: cexEntity.linkedin || null,
          };
  
          const result = await session.run(query, params);
  
          return result.records[0].get("cex").properties;
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
