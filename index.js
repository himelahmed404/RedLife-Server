const express = require('express');
const app = express()
const port = process.env.PORT || 5000

const cors = require('cors')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

require('dotenv').config()

// Stripe (test mode) — only initialised when the secret key is present
const stripe = process.env.STRIPE_SECRET_KEY
  ? require('stripe')(process.env.STRIPE_SECRET_KEY)
  : null;

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
    const fundsCollection = database.collection("funds");
    const countersCollection = database.collection("counters");

    // One fund record per Stripe checkout session (prevents double counting)
    await fundsCollection.createIndex({ sessionId: 1 }, { unique: true });

    // Create donation request
    app.post('/api/create-donation-request', async (req, res) => {
      const donationRequest = req.body;

      try {
        // Only active users can create donation requests
        const { userId } = donationRequest;
        if (!userId || !ObjectId.isValid(userId)) {
          return res.status(401).json({ message: 'You must be logged in to create a request' });
        }

        const user = await usersCollection.findOne({ _id: new ObjectId(userId) });
        if (!user) {
          return res.status(404).json({ message: 'User not found' });
        }
        if (user.isActive === false) {
          return res.status(403).json({ message: 'Your account is blocked. Blocked users cannot create donation requests.' });
        }

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

    // Donations made by a user (requests where they committed as the donor)
    app.get('/api/my-donations/:donorId', async (req, res) => {
      const { donorId } = req.params;

      try {
        const donations = await donationRequestsCollection
          .find({ donorId: donorId })
          .sort({ updatedAt: -1 })
          .toArray();

        res.status(200).json(donations);
      } catch (error) {
        console.error('Error fetching donations:', error);
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

    // Get all users
    app.get('/api/admin/users', async (req, res) => {
      try {
        const users = await usersCollection.find({}).sort({ createdAt: -1 }).toArray();
        res.status(200).json(users);
      } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ message: 'Internal server error' });
      }
    });

    // Public donor search (?bloodGroup=A%2B&district=Dhaka&upazila=Savar)
    app.get('/api/donors/search', async (req, res) => {
      const { bloodGroup, district, upazila } = req.query;

      // Only active users who have set a blood group
      const query = { isActive: { $ne: false }, bloodGroup: { $nin: ['', null] } };
      if (bloodGroup) query.bloodGroup = bloodGroup;
      if (district) query.district = district;
      if (upazila) query.upazila = upazila;

      try {
        const donors = await usersCollection
          .find(query)
          .project({ name: 1, image: 1, email: 1, number: 1, bloodGroup: 1, district: 1, upazila: 1 })
          .sort({ name: 1 })
          .toArray();

        res.status(200).json(donors);
      } catch (error) {
        console.error('Error searching donors:', error);
        res.status(500).json({ message: 'Internal server error' });
      }
    });

    // Get donation request details by ID
    app.get("/api/donation-requests/detail/:id", async (req, res) => {
      const { id } = req.params;
      try {
        const query = ObjectId.isValid(id) ? { _id: new ObjectId(id) } : { _id: id };
        const request = await donationRequestsCollection.findOne(query);
        if (!request) return res.status(404).json({ message: "Request not found" });
        res.status(200).json(request);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // ── Update request status & save donor details when committed ──
    app.patch('/api/donation-requests/status/:id', async (req, res) => {
      const { id } = req.params;
      const { status, donorName, donorEmail, donorId } = req.body;

      try {
        const query = ObjectId.isValid(id) ? { _id: new ObjectId(id) } : { _id: id };

        const updateFields = {
          status,
          updatedAt: new Date().toISOString()
        };

        // Attach donor information if coming from the commitment modal
        if (donorName) updateFields.donorName = donorName;
        if (donorEmail) updateFields.donorEmail = donorEmail;
        if (donorId) updateFields.donorId = donorId;

        const result = await donationRequestsCollection.updateOne(query, {
          $set: updateFields
        });

        if (result.matchedCount === 1) {
          res.status(200).json({
            message: "Status updated successfully",
            status,
            ...updateFields
          });
        } else {
          res.status(404).json({ message: "Request not found" });
        }
      } catch (error) {
        console.error("Status update error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    });

    // All donation requests (Admin only)
    app.get('/api/all-blood-donation-requests', async (req, res) => {
      try {
        const donationRequests = await donationRequestsCollection.find({}).sort({ createdAt: -1 }).toArray();
        res.status(200).json(donationRequests);
      } catch (error) {
        console.error('Error fetching donation requests:', error);
        res.status(500).json({ message: 'Internal server error' });
      }
    });

    // Update donation request status by admin and volunteer (e.g., "pending", "approved", "canceled")
    app.patch('/api/donation-requests/status/:id', async (req, res) => {
      const { id } = req.params;
      const { status } = req.body;
    
      try {
        const query = ObjectId.isValid(id) ? { _id: new ObjectId(id) } : { _id: id };
        const result = await donationRequestsCollection.updateOne(
          query,
          { $set: { status, updatedAt: new Date().toISOString() } }
        );
    
        if (result.matchedCount === 1) {
          res.status(200).json({ message: "Status updated successfully", status });
        } else {
          res.status(404).json({ message: "Request not found" });
        }
      } catch (error) {
        console.error("Status update error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    });

    // Toggle user active/blocked status (isActive: boolean)
    app.patch('/api/admin/users/:id/status', async (req, res) => {
      const { id } = req.params;
      const { isActive } = req.body; // Expects boolean true or false

      try {
        const query = ObjectId.isValid(id) ? { _id: new ObjectId(id) } : { _id: id };
        const result = await usersCollection.updateOne(
          query,
          {
            $set: {
              isActive: Boolean(isActive),
              updatedAt: new Date()
            }
          }
        );

        if (result.matchedCount === 1) {
          res.status(200).json({
            message: `User is now ${isActive ? "active" : "blocked"}`,
            isActive: Boolean(isActive)
          });
        } else {
          res.status(404).json({ message: 'User not found' });
        }
      } catch (error) {
        console.error('Error updating status:', error);
        res.status(500).json({ message: 'Internal server error' });
      }
    });


    // Update user role (handles both 'Role' and 'role')
    app.patch('/api/admin/users/:id/role', async (req, res) => {
      const { id } = req.params;
      const { role } = req.body; // "admin" | "volunteer" | "donor"

      try {
        const query = ObjectId.isValid(id) ? { _id: new ObjectId(id) } : { _id: id };
        const result = await usersCollection.updateOne(
          query,
          {
            $set: {
              Role: role.toLowerCase(),
              role: role.toLowerCase(),
              updatedAt: new Date()
            }
          }
        );

        if (result.matchedCount === 1) {
          res.status(200).json({ message: `User role changed to ${role}` });
        } else {
          res.status(404).json({ message: 'User not found' });
        }
      } catch (error) {
        console.error('Error updating role:', error);
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


    // Funding apis (Stripe Checkout)

    // All fund contributions, newest first
    app.get('/api/funds', async (req, res) => {
      try {
        const funds = await fundsCollection.find({}).sort({ createdAt: -1 }).toArray();
        res.status(200).json(funds);
      } catch (error) {
        console.error('Error fetching funds:', error);
        res.status(500).json({ message: 'Internal server error' });
      }
    });

    // Create a Stripe Checkout session and return its hosted payment page URL
    app.post('/api/funds/create-checkout-session', async (req, res) => {
      const { userId, amount } = req.body;
      const amountTaka = Number(amount);

      if (!stripe) {
        return res.status(500).json({ message: 'Payments are not configured on the server' });
      }
      if (!userId || !ObjectId.isValid(userId)) {
        return res.status(401).json({ message: 'You must be logged in to give fund' });
      }
      if (!Number.isInteger(amountTaka) || amountTaka < 100 || amountTaka > 500000) {
        return res.status(400).json({ message: 'Amount must be a whole number between ৳100 and ৳500,000' });
      }

      try {
        const user = await usersCollection.findOne({ _id: new ObjectId(userId) });
        if (!user) {
          return res.status(404).json({ message: 'User not found' });
        }

        const clientUrl = process.env.CLIENT_URL || req.headers.origin || 'http://localhost:3000';

        const session = await stripe.checkout.sessions.create({
          mode: 'payment',
          line_items: [
            {
              price_data: {
                currency: 'bdt',
                product_data: { name: 'RedLife fund contribution' },
                unit_amount: amountTaka * 100, // Stripe expects poisha
              },
              quantity: 1,
            },
          ],
          customer_email: user.email,
          metadata: { userId, name: user.name || '' },
          success_url: `${clientUrl}/funding?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${clientUrl}/funding?canceled=1`,
        });

        res.status(200).json({ url: session.url });
      } catch (error) {
        console.error('Error creating checkout session:', error);
        res.status(500).json({ message: error.message || 'Could not start payment' });
      }
    });

    // Verify a finished checkout with Stripe and record it (safe to call more than once)
    app.post('/api/funds/confirm', async (req, res) => {
      const { sessionId } = req.body;

      if (!stripe) {
        return res.status(500).json({ message: 'Payments are not configured on the server' });
      }
      if (!sessionId) {
        return res.status(400).json({ message: 'Missing session id' });
      }

      try {
        const existing = await fundsCollection.findOne({ sessionId });
        if (existing) {
          return res.status(200).json(existing);
        }

        const session = await stripe.checkout.sessions.retrieve(sessionId);
        if (session.payment_status !== 'paid') {
          return res.status(400).json({ message: 'Payment has not been completed' });
        }

        // Sequential reference number: F-101, F-102, ...
        const counter = await countersCollection.findOneAndUpdate(
          { _id: 'fundRef' },
          { $inc: { seq: 1 } },
          { upsert: true, returnDocument: 'after' }
        );

        const fund = {
          ref: `F-${100 + counter.seq}`,
          sessionId,
          userId: session.metadata?.userId || '',
          name: session.metadata?.name || session.customer_details?.name || 'Anonymous',
          email: session.customer_details?.email || session.customer_email || '',
          amount: session.amount_total / 100,
          currency: session.currency,
          createdAt: new Date().toISOString(),
        };

        try {
          await fundsCollection.insertOne(fund);
        } catch (error) {
          // Another confirm call for the same session won the race
          if (error.code === 11000) {
            return res.status(200).json(await fundsCollection.findOne({ sessionId }));
          }
          throw error;
        }

        res.status(201).json(fund);
      } catch (error) {
        console.error('Error confirming fund:', error);
        res.status(500).json({ message: error.message || 'Could not confirm payment' });
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


