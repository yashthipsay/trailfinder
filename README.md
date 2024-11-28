# **Bitcoin Transaction Flow Mapping with Neo4j and Arkham API**

## **Overview**
This project is designed to trace and analyze Bitcoin transaction flows using Neo4j as the graph database, Arkham Intelligence API for enriched blockchain intelligence, and custom recursive mapping logic. The application identifies relationships between Bitcoin addresses, transactions, and centralized exchanges (`cex`) for advanced fraud detection, anomaly tracking, and fund flow visualization.

## **Features**
- **Recursive Transaction Flow Mapping**:
  - Traces Bitcoin transactions across multiple layers of input (`vin`) and output (`vout`) addresses up to a configurable depth.
  - Captures both direct and indirect relationships between addresses.

- **Centralized Exchange (CEX) Integration**:
  - Identifies transactions involving centralized exchanges.
  - Links `Transaction` nodes with `CentralizedExchange` nodes using real-world metadata such as name, website, and social links (via the Arkham API).

- **Dynamic Relationship Creation**:
  - Dynamically maps Bitcoin transactions and their relationships (e.g., `FUNDS`, `OUTPUT`, and `INVOLVES`) in Neo4j.
  - Differentiates between addresses that are normal wallets and those associated with exchanges.

- **Machine Learning Dataset Preparation**:
  - Generates graph-based datasets that can be used for heuristic clustering, taint analysis, or anomaly detection algorithms.

- **Arkham API Integration**:
  - Leverages Arkham Intelligence API to fetch transfer metadata and entity information.
  - Fetches and maps Bitcoin transfers to and from centralized exchanges.

## **Technologies Used**
- **Neo4j**: Graph database to store and query Bitcoin transactions and relationships.
- **Arkham Intelligence API**: Provides enriched blockchain intelligence.
- **JavaScript (Node.js)**: Implements recursive transaction flow mapping and API integrations.
- **Axios**: For making API requests to the Arkham API.
- **GraphQL**: Exposes an API for querying transactions and their relationships.

## **Architecture**
1. **Input**: A starting Bitcoin address and depth limit.
2. **Processing**:
   - Recursive function `mapFundFlow`:
     - Fetches transaction data using APIs.
     - Identifies relationships between transactions, addresses, and centralized exchanges.
     - Maps these entities into Neo4j.
   - `getEntityTransfers`: Queries Arkham API to fetch CEX-related transfers.
   - `mapCexTransferToNeo4j`: Creates `CentralizedExchange` nodes and links them to `Transaction` nodes.
3. **Output**:
   - A complete graph stored in Neo4j, exposing relationships for analysis and querying.

## **Setup**
### **Prerequisites**
- Node.js installed.
- A running Neo4j instance.
- Arkham Intelligence API key.

### **Installation**
1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/map-btc-flow.git
   cd map-btc-flow
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure environment variables:
   Create a `.env` file in the project root:
   ```env
   NEO4J_URI=bolt://localhost:7687
   NEO4J_USERNAME=neo4j
   NEO4J_PASSWORD=yourpassword
   ARKHAM_API_KEY=your-arkham-api-key
   ```

4. Start the application:
   ```bash
   node index.js
   ```

## **Usage**
### **Start Mapping**
Run the `startMapping` function to begin tracing Bitcoin transactions:
```javascript
import mapBtcFlow from "./path/to/mapBtcFlow.js";

const btcMapper = new mapBtcFlow();
btcMapper.startMapping("startingBitcoinAddress", 5); // Replace with the actual address and depth limit
```

### **GraphQL API**
A GraphQL server is exposed to query the Neo4j graph:
- Get a specific transaction:
  ```graphql
  query {
    transaction(hash: "txid") {
      hash
      vin {
        txid
        prevout {
          value
          address
        }
      }
      vout {
        value
        address
      }
      involvedCex {
        name
        website
      }
    }
  }
  ```

- Query all transactions:
  ```graphql
  query {
    transactions {
      hash
    }
  }
  ```

## **Example Applications**
- **Fraud Detection**:
  - Trace anomalous transactions to centralized exchanges.
  - Visualize fund flows for suspicious activity.
- **Machine Learning**:
  - Generate graph-based datasets for clustering or classification.
- **Blockchain Intelligence**:
  - Analyze address behavior and transaction patterns.
  - Identify high-risk addresses interacting with centralized exchanges.

## **File Structure**
```plaintext
.
├── src/
│   ├── mapBtcFlow.js        # Recursive mapping logic
│   ├── neo4jdriver.js       # Neo4j driver setup
│   ├── cexEntities.js       # List of known centralized exchanges
│   ├── generateDataset.js   # Dataset generation logic
│   └── graphql/             # GraphQL type definitions and resolvers
├── .env                     # Environment variables
├── package.json             # Node.js dependencies
└── README.md                # Project documentation
```

## **Future Improvements**
- **Pagination Handling**: Add support for handling paginated responses from APIs.
- **Error Tolerance**: Implement retry logic for API calls and database connections.
- **Visualization**: Integrate a front-end tool to visualize the Neo4j graph.
- **Enhanced ML Features**: Extract additional features like transaction age, entity type frequency, etc.

## **Contributing**
Contributions are welcome! Please follow these steps:
1. Fork the repository.
2. Create a feature branch: `git checkout -b feature-name`.
3. Commit your changes: `git commit -m "Add feature name"`.
4. Push to your branch: `git push origin feature-name`.
5. Submit a pull request.

---

## **License**
This project is licensed under the MIT License. See the [LICENSE](./LICENSE) file for details.

---

### **Contact**
For inquiries or issues, please contact:
- **Email**: ythipsay@gmail.com
- **GitHub**: [yashthipsay](https://github.com/yashthipsay)

--- 

Feel free to copy this README structure and customize it further based on your specific project details!
