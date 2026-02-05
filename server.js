const express = require('express');
const cors = require('cors');
const path = require('path'); // Node.js module for working with file paths
require('dotenv').config(); // Loads environment variables from a .env file
const session = require('express-session');
const { connectDB } = require('./config/database');
const productRoutes = require('./routes/products');
const adminRoutes = require('./routes/admin'); // Import admin routes


// Initialize Express app
const app = express();

// --- Connect to Database ---
connectDB();

// In server.js, replace connectDB() call with this:
const { sequelize } = require('./models/models'); // Make sure path is correct
// ...
// --- Database Sync ---
const syncDatabase = async () => {
  try {
    await sequelize.sync({ alter: true }); // Use { force: true } to drop and recreate tables for a fresh start
    console.log('✅ Database synchronized successfully.');
  } catch (error) {
    console.error('❌ Unable to synchronize the database:', error);
  }
};
// syncDatabase(); // Uncomment when database schema needs updating

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-fallback-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // Set to true in production with HTTPS
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));



// 2. ENABLE CORS
// This tells the server to allow requests from your React app's origin
app.use(cors({
  origin: '*' // Replace with your React app's URL if different
}));

// --- EJS Setup for Admin Panel ---
// Set the directory where the template files are located
app.use(express.static(path.join(__dirname, "public")));
app.set('views', path.join(__dirname, 'views'));


// Set EJS as the template engine
app.set('view engine', 'ejs');

// --- Middlewares ---
// Enable Cross-Origin Resource Sharing (CORS) for all routes (for the React app)
app.use(cors());
// Parse incoming JSON requests and put the parsed data in req.body
app.use(express.json());
// Middleware to parse urlencoded bodies (for form submissions from EJS)
app.use(express.urlencoded({ extended: true }));
// Serve static files (like CSS) for the admin panel
app.use('/static', express.static(path.join(__dirname, 'public')));


// --- API Routes (for React App) ---
// A simple test route
app.get('/', (req, res) => {
  res.send('E-commerce API is running...');
});

// Use the product routes for any requests to /api/products
app.use('/api/products', productRoutes);

// --- Server-Rendered Admin Routes (for EJS Views) ---
app.use('/admin', adminRoutes);
app.use('/api/users', require('./routes/users'));
app.use('/api/cart', require('./routes/cart'));
app.use('/api/subscriptions', require('./routes/subscriptions'));
app.use('/api/flash-sales', require('./routes/flashSales.js'));
app.use('/api/influencers', require('./routes/influencer'));
app.use('/api/mega-offer', require('./routes/megaOffer'));


// --- Server ---
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
});

