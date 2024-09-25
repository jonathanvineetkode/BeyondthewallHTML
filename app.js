const express = require('express');
const { MongoClient } = require('mongodb');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;

// MongoDB connection URI
const MONGO_URI = process.env.MONGO_URI;

let db;
let loggedInUser = null; // Temporary variable to hold logged-in user data

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Connect to MongoDB
MongoClient.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(client => {
    console.log('Connected to MongoDB');
    db = client.db('treasurehunt'); // Use your desired database name

    // Start the server only after the database connection is successful
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1); // Exit if the connection fails
  });

// Home route
app.get('/', (req, res) => {
  res.send(`
    <h1>Welcome</h1>
    <a href="/login">Login</a>
  `);
});

// Login route
app.get('/login', (req, res) => {
  res.send(`
    <h1>Login</h1>
    <form action="/login" method="POST">
      <input type="text" name="username" placeholder="Username" required>
      <input type="password" name="password" placeholder="Password" required>
      <button type="submit">Login</button>
    </form>
  `);
});

// Handle login
// Handle login
app.post('/login', async (req, res) => {
    try {
      const { username, password } = req.body;
      const user = await db.collection('users').findOne({ username, password });
  
      if (user) {
        loggedInUser = user; // Store the logged-in user temporarily
        loggedInUser.currentRound = 1; // Reset current round to 1
  
        // Update the user's currentRound in the database to 1
        await db.collection('users').updateOne(
          { _id: loggedInUser._id },
          { $set: { currentRound: 1 } } // Ensure this sets currentRound to 1
        );
  
        res.redirect('/round');
      } else {
        res.status(401).send('Invalid username or password');
      }
    } catch (err) {
      console.error('Failed to login:', err);
      res.status(500).send('Failed to login user');
    }
  });
  
// GET route to display round, question, and venue
app.get('/round', async (req, res) => {
  if (!db) {
    return res.status(500).json({ error: 'Database not initialized' });
  }

  if (!loggedInUser) {
    return res.status(403).send('Please login first');
  }

  try {
    // Fetch round details based on the user's current round
    const roundData = await db.collection(loggedInUser.path).findOne({ round: loggedInUser.currentRound });

    if (!roundData) {
      return res.status(404).send('No data found for the round');
    }

    // Display round number, question, and venue with an input box for the answer
    res.send(`
      <h1>Round ${roundData.round}</h1>
      <p>Question: ${roundData.question}</p>
      <p>Venue: ${roundData.venue}</p>
      <form action="/submit-answer" method="POST">
        <input type="text" name="answer" placeholder="Your Answer" required>
        <button type="submit">Submit Answer</button>
      </form>
    `);
  } catch (err) {
    console.error('Failed to fetch round data:', err);
    res.status(500).send('Failed to fetch round data');
  }
});

// POST route to handle answer submission
app.post('/submit-answer', async (req, res) => {
  if (!loggedInUser) {
    return res.status(403).send('Please login first');
  }

  const { answer } = req.body;

  try {
    // Fetch the current round details to compare the submitted answer with the correct solution
    const roundData = await db.collection(loggedInUser.path).findOne({ round: loggedInUser.currentRound });

    if (!roundData) {
      return res.status(404).send('No round data found');
    }

    // Compare the submitted answer with the correct solution
    if (answer.trim().toLowerCase() === roundData.solution.trim().toLowerCase()) {
      // Increment the current round number for the next round
      loggedInUser.currentRound += 1;

      // Update the user's currentRound in the database
      await db.collection('users').updateOne(
        { _id: loggedInUser._id },
        { $set: { currentRound: loggedInUser.currentRound } }
      );

      // Fetch the next round data
      const nextRoundData = await db.collection(loggedInUser.path).findOne({ round: loggedInUser.currentRound });

      if (nextRoundData) {
        res.send(`
          <h1>Congratulations, ${loggedInUser.username}!</h1>
          <p>Your answer: "${answer}" is correct!</p>
          <p>Ready for the next round?</p>
          <a href="/round">Next Round</a>
        `);
      } else {
        res.send(`
          <h1>Congratulations, ${loggedInUser.username}!</h1>
          <p>Your answer: "${answer}" is correct!</p>
          <p>You have completed all rounds!</p>
          <a href="/">Go Home</a>
        `);
      }
    } else {
      res.send(`
        <h1>Sorry, ${loggedInUser.username}!</h1>
        <p>Your answer: "${answer}" is incorrect. Please try again.</p>
        <a href="/round">Go Back to Round</a>
      `);
    }
  } catch (err) {
    console.error('Failed to submit answer:', err);
    res.status(500).send('Failed to submit answer');
  }
});
