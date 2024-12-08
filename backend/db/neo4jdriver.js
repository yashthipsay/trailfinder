import neo4j, { driver } from 'neo4j-driver'
import dotenv from 'dotenv'

// dotenv.config({
//   path: 'Neo4j-1dd9edf7-Created-2024-09-01.txt',
//   debug: true,
//   encoding: 'utf8',
// })


const URI = "neo4j+s://2a5d4ce2.databases.neo4j.io"
const USER = "neo4j"
const PASSWORD = "xmsSwC4kCouphYt-mtAivpVyJzmkZLBQO4MHAjGNfYE"
export const calldB = (async () => {
   
    let driver
    console.log("Connecting to db");
  
    try {
      driver = neo4j.driver(URI, neo4j.auth.basic(USER, PASSWORD))
      console.log(await driver.verifyAuthentication())
      const serverInfo = await driver.getServerInfo()
      console.log('Connection established')
      console.log(serverInfo)
    } catch(err) {
      console.log(`Connection error\n${err}\nCause: ${err.cause}`)
      await driver.close()
      return
    }

    await driver.close()
  })();

  export const getDriver = () => {
    let driver = neo4j.driver(URI, neo4j.auth.basic(USER, PASSWORD))
    return driver
  }
