import { Contract } from "@ethersproject/contracts";
import { Provider } from "@ethersproject/providers";
import * as ethers from "ethers";

const abi = [`event TokensDeposited(address indexed sourceNetworkTokenAddress,uint256 amount,address indexed receiverAddress,uint256 sourceChainId,uint256 targetChainId,uint256 number)`]
const otherAbi = [`event Transfer (address from, address to, uint256 value)`];
const contractInterface = new ethers.Interface(abi);
const provider = new ethers.JsonRpcProvider("https://mainnet.infura.io/v3/a6cd886ad67c44bdb86bb5ab0797f5b4");
const bridgeTokenAddress = "0xCBCe172d7af2616804ab5b2494102dAeC47B2635";
const contract = new ethers.Contract(bridgeTokenAddress, abi, provider);
// const decodeData = contractInterface.parseTransaction 

async function getEventsByTransactionHash(txHash) {
    try {
        console.log("Fetching events for transaction:", txHash);
      // Get transaction receipt
      const receipt = await provider.getTransactionReceipt(txHash);
      
      if (!receipt) {
        console.log("Transaction not found or not yet mined");
        return;
      }
      for(const log of receipt.logs) {
        const parsedLog = contract.interface.parseLog(log);
        console.log("Events emitted", parsedLog);
      }
  
      // Parse logs
      const logs = receipt.logs.map(log => {
        try {
            const parsedLog = contract.interface.parseLog(log);
          return parsedLog;
        } catch (e) {
          // Log is not from this contract or doesn't match ABI
          console.log("Not the event you want");
        }
      }).filter(log => log !== null);
  
      // Print parsed events
     
  
    } catch (error) {
      console.error("Error fetching events:", error);
    }
  }


export default getEventsByTransactionHash;
