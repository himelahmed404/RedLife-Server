const express = require('express');
const app = express()
const port = 5000

const cors = require('cors')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

require('dotenv').config()

app.use(cors())
app.use(express.json())


const uri = process.env.MONGO_URI;

app.get('/', (req, res) => {
  res.send('Hello World!')
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})


 