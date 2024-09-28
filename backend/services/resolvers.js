// resolvers.js
export const resolvers = {
    Query: {
      wallets: async (_, __, { driver }) => {
        const session = driver.session();
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
          await session.close();
        }
      },
      transactions: async (_, __, { driver }) => {
        const session = driver.session();
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
          await session.close();
        }
      }
    },
    Mutation: {
      addWallet: async (_, { address, chainId }, { driver }) => {
        const session = driver.session();
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
          await session.close();
        }
      },
      addTransaction: async (_, { fromWallet, toWallet, amount, timestamp, chainId }, { driver }) => {
        const session = driver.session();
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
          await session.close();
        }
      }
    }
  };
  