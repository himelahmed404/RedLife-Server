const express = require('express');
const app = express()
const port = process.env.PORT || 5000

const cors = require('cors')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

require('dotenv').config()

app.use(cors())
app.use(express.json())


const uri = process.env.MONGO_URI;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const database = client.db("redlife");
    const usersCollection = database.collection("user");
    const donationRequestsCollection = database.collection("donationRequests");

    // Create donation request
    app.post('/api/create-donation-request', async (req, res) => {
      const donationRequest = req.body;

      try {
        const result = await donationRequestsCollection.insertOne(donationRequest);
        res.status(201).json({ message: 'Donation request created successfully', id: result.insertedId });
      } catch (error) {
        console.error('Error creating donation request:', error);
        res.status(500).json({ message: 'Internal server error' });
      }
    });


    //donation request get by user id
    app.get('/api/donation-requests/:userId', async (req, res) => {
      const { userId } = req.params;

      try {
        const donationRequests = await donationRequestsCollection
          .find({ userId: userId })
          .sort({ createdAt: -1 })
          .toArray();

        res.status(200).json(donationRequests);
      } catch (error) {
        console.error('Error fetching donation requests:', error);
        res.status(500).json({ message: 'Internal server error' });
      }
    });

    // Edit/Update full donation request details
    app.put('/api/donation-requests/edit/:id', async (req, res) => {
      const { id } = req.params;
      const {
        recipientName,
        bloodGroup,
        districtName,
        upazilaName,
        hospitalName,
        address,
        donationDate,
        donationTime,
        message,
        status
      } = req.body;

      try {
        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            recipientName,
            bloodGroup,
            districtName,
            upazilaName,
            hospitalName,
            address,
            donationDate,
            donationTime,
            message,
            ...(status && { status }),
            updatedAt: new Date().toISOString()
          }
        };

        const result = await donationRequestsCollection.updateOne(filter, updateDoc);

        if (result.matchedCount === 1) {
          res.status(200).json({ message: "Request updated successfully" });
        } else {
          res.status(404).json({ message: "Request not found" });
        }
      } catch (error) {
        console.error("Edit request error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    });


    // Delete a donation request
    app.delete('/api/donation-requests/:id', async (req, res) => {
      const { id } = req.params;

      try {
        const result = await donationRequestsCollection.deleteOne({ _id: new ObjectId(id) });

        if (result.deletedCount === 1) {
          res.status(200).json({ message: "Request deleted successfully" });
        } else {
          res.status(404).json({ message: "Request not found" });
        }
      } catch (error) {
        console.error("Delete request error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    });

    //Admin apis

    //Get all users
    app.get('/api/admin/users', async (req, res) => {
      try {
        const users = await usersCollection.find({}).sort({ createdAt: -1 }).toArray();
        res.status(200).json(users);
      } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ message: 'Internal server error' });
      }
    });










    //profile update
    app.post('/api/profile/update-profile', async (req, res) => {
      const { userId, name, email, image, number, bloodGroup, district, upazila } = req.body;

      try {
        const filter = { _id: new ObjectId(userId) };
        const updateDoc = {
          $set: {
            name,
            email,
            number,
            image,
            bloodGroup,
            district,
            upazila
          },
        };

        const result = await usersCollection.updateOne(filter, updateDoc);

        if (result.modifiedCount === 1) {
          res.status(200).json({ message: 'Profile updated successfully' });
        } else {
          res.status(404).json({ message: 'User not found or no changes made' });
        }
      } catch (error) {
        console.error('Error updating profile:', error);
        res.status(500).json({ message: 'Internal server error' });
      }
    });





    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
  res.send('Hello World!')
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})


