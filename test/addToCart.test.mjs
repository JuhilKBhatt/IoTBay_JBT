import request from 'supertest';
import express from 'express';
import { MongoClient, ObjectId } from 'mongodb';
import session from 'express-session';
import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import { expect } from 'chai';

const app = express();

// Middleware setup (similar to your main app)
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(session({
  secret: '123',
  resave: false,
  saveUninitialized: true
}));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// MongoDB setup
const uri = "mongodb+srv://Juhil:LOcRO08NWfCAoGib@iotbay.w6qgafn.mongodb.net/?retryWrites=true&w=majority&appName=IoTBay";
const client = new MongoClient(uri, { useUnifiedTopology: true });

let productsCollection;
let usersCollection;

before(async () => {
  await client.connect();
  const database = client.db("test");
  productsCollection = database.collection("products");
  usersCollection = database.collection("users");
  await productsCollection.deleteMany({});
  await usersCollection.deleteMany({});
  
  // Insert a sample product
  await productsCollection.insertOne({
    _id: new ObjectId("664064abea125fd499ee9bfc"),
    DeviceName: 'Test Device',
    DevicePrice: 100,
    DeviceStock: 3
  });

  // Insert a sample user
  await usersCollection.insertOne({
    _id: new ObjectId("60a6f6f6f6f6f6f6f6f7"),
    username: 'testuser',
    password: 'password',
    activityLog: []
  });
});

// Route handler for adding to cart (mock of your main app route)
app.post('/addToCart', async (req, res) => {
  try {
    const productId = req.body.productId;
    let quantityToAdd = parseInt(req.body.quantity); // Parse quantity to integer
    
    // Aggregate query to retrieve the product details
    const productAggregate = await productsCollection.aggregate([
      { $match: { _id: new ObjectId(productId) } }
    ]).toArray();
    
    // Check if product exists
    if (productAggregate.length === 0) {
      return res.status(404).send('Product not found');
    }
    
    // Extract the product from the array
    const product = productAggregate[0];
    
    // Set the maximum quantity to the available stock (DeviceStock)
    const maxQuantity = product.DeviceStock;
    
    // Initialize cart in session if not already exists
    req.session.cart = req.session.cart || {};
    
    // Calculate the total quantity of the product in the cart
    const currentQuantity = req.session.cart[productId] || 0;
    const totalQuantity = currentQuantity + quantityToAdd;
    
    // Check if adding the quantity exceeds the maximum allowed quantity
    if (totalQuantity > maxQuantity) {
      // Calculate the quantity that can be added without exceeding the limit
      quantityToAdd = maxQuantity - currentQuantity;
    }
    
    // Add quantity of the product to the cart
    req.session.cart[productId] = (req.session.cart[productId] || 0) + quantityToAdd;

    // Check if user is logged in
    if (req.session.userId) {
      // Retrieve userId from session
      const userId = req.session.userId;

      // Update the user document in the database to add the activity log entry
      await usersCollection.updateOne(
        { _id: new ObjectId(userId) },
        { $push: { activityLog: `Added ${quantityToAdd} of ${product.DeviceName} to cart` } }
      );
    }

    // Redirect to index page after adding to cart
    res.redirect(302, '/index');
  } catch (error) {
    console.error('Error in adding product to cart:', error);
    return res.status(500).send('Error in adding product to cart');
  }
});

// Route handler for removing from cart (mock of your main app route)
app.post('/removeFromCart', (req, res) => {
  try {
    const productIdToRemove = req.body.productId;
    
    // Check if the productIdToRemove is in the session cart
    if (req.session.cart && req.session.cart[productIdToRemove]) {
      // Remove the product from the session cart
      delete req.session.cart[productIdToRemove];
      res.redirect(302, '/cart'); // Redirect back to the cart page
    } else {
      res.status(404).send('Product not found in cart');
    }
  } catch (error) {
    console.error('Error removing product from cart:', error);
    res.status(500).send('Error removing product from cart');
  }
});

describe('POST /addToCart', function() {
  it('should add the correct quantity to the cart', function(done) {
    const agent = request.agent(app);

    // Mock login session
    agent
      .post('/login')
      .send({ username: 'testuser', password: 'password' })
      .end((err, res) => {
        if (err) return done(err);
        expect(res.status).to.equal(302);
        
        agent
          .post('/addToCart')
          .send({ productId: '664064abea125fd499ee9bfc', quantity: '2' })
          .end((err, res) => {
            if (err) return done(err);
            expect(res.status).to.equal(302);

            // Check if the cart has the correct quantity
            agent
              .get('/cart')
              .end((err, res) => {
                if (err) return done(err);
                expect(res.status).to.equal(200);
                const cart = res.body.cart;
                expect(cart['664064abea125fd499ee9bfc']).to.equal(2);
                done();
              });
          });
      });
  });

  it('should remove product with 0 stock from the cart', function(done) {
    const agent = request.agent(app);

    // Mock login session
    agent
      .post('/login')
      .send({ username: 'testuser', password: 'password' })
      .end((err, res) => {
        if (err) return done(err);
        expect(res.status).to.equal(302);

        agent
          .post('/addToCart')
          .send({ productId: '664064abea125fd499ee9bfc', quantity: '3' })
          .end((err, res) => {
            if (err) return done(err);
            expect(res.status).to.equal(302);

            // Check if the cart has the product
            agent
              .get('/cart')
              .end((err, res) => {
                if (err) return done(err);
                expect(res.status).to.equal(200);
                let cart = res.body.cart;
                expect(cart['664064abea125fd499ee9bfc']).to.equal(3);

                // Remove the product from the cart
                agent
                  .post('/removeFromCart')
                  .send({ productId: '664064abea125fd499ee9bfc' })
                  .end((err, res) => {
                    if (err) return done(err);
                    expect(res.status).to.equal(302);

                    // Check if the cart is empty
                    agent
                      .get('/cart')
                      .end((err, res) => {
                        if (err) return done(err);
                        expect(res.status).to.equal(200);
                        cart = res.body.cart;
                        expect(cart['664064abea125fd499ee9bfc']).to.be.undefined;
                        done();
                      });
                  });
              });
          });
      });
  });
});

after(async () => {
  await client.close();
});
